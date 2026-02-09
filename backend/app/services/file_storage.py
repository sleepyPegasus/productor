"""File storage service supporting local filesystem and object storage.

This module provides an abstraction layer for file storage operations,
supporting both local filesystem (for development) and S3-compatible
object storage (for production).

Usage:
    from app.services.file_storage import get_storage
    
    storage = get_storage()
    
    # Upload a file
    url = await storage.upload(
        bucket="designs",
        key="project_123/page_1.png",
        data=file_bytes,
        content_type="image/png",
    )
    
    # Download a file
    data = await storage.download(bucket="designs", key="project_123/page_1.png")
    
    # Delete a file
    await storage.delete(bucket="designs", key="project_123/page_1.png")
"""

import os
import io
import base64
import hashlib
from abc import ABC, abstractmethod
from typing import Optional, BinaryIO
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings


class StorageBackend(ABC):
    """Abstract base class for storage backends."""

    @abstractmethod
    async def upload(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Upload a file and return its URL."""
        pass

    @abstractmethod
    async def download(self, bucket: str, key: str) -> bytes:
        """Download a file."""
        pass

    @abstractmethod
    async def delete(self, bucket: str, key: str) -> bool:
        """Delete a file."""
        pass

    @abstractmethod
    async def exists(self, bucket: str, key: str) -> bool:
        """Check if a file exists."""
        pass

    @abstractmethod
    def get_url(self, bucket: str, key: str) -> str:
        """Get the URL for a file."""
        pass


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend (for development)."""

    def __init__(self, base_path: str = "./uploads"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.public_url_base = os.getenv("LOCAL_STORAGE_URL_BASE", "/uploads")

    async def upload(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Upload a file to local filesystem."""
        bucket_path = self.base_path / bucket
        bucket_path.mkdir(parents=True, exist_ok=True)

        file_path = bucket_path / key
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "wb") as f:
            f.write(data)

        # Store metadata if provided
        if metadata:
            meta_path = file_path.with_suffix(file_path.suffix + ".meta")
            import json
            with open(meta_path, "w") as f:
                json.dump({
                    "content_type": content_type,
                    "metadata": metadata,
                    "uploaded_at": datetime.utcnow().isoformat(),
                }, f)

        return self.get_url(bucket, key)

    async def download(self, bucket: str, key: str) -> bytes:
        """Download a file from local filesystem."""
        file_path = self.base_path / bucket / key
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {bucket}/{key}")

        with open(file_path, "rb") as f:
            return f.read()

    async def delete(self, bucket: str, key: str) -> bool:
        """Delete a file from local filesystem."""
        file_path = self.base_path / bucket / key
        if not file_path.exists():
            return False

        file_path.unlink()

        # Delete metadata if exists
        meta_path = file_path.with_suffix(file_path.suffix + ".meta")
        if meta_path.exists():
            meta_path.unlink()

        return True

    async def exists(self, bucket: str, key: str) -> bool:
        """Check if a file exists."""
        file_path = self.base_path / bucket / key
        return file_path.exists()

    def get_url(self, bucket: str, key: str) -> str:
        """Get the URL for a file."""
        return f"{self.public_url_base}/{bucket}/{key}"


class S3StorageBackend(StorageBackend):
    """S3-compatible object storage backend (for production).
    
    Supports AWS S3, MinIO, Alibaba Cloud OSS, etc.
    """

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        region: str = "us-east-1",
    ):
        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise ImportError(
                "boto3 is required for S3 storage. "
                "Install with: pip install boto3"
            )

        self.endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT_URL")
        self.access_key = access_key or os.getenv("S3_ACCESS_KEY")
        self.secret_key = secret_key or os.getenv("S3_SECRET_KEY")
        self.region = region or os.getenv("S3_REGION", "us-east-1")
        self.bucket_prefix = os.getenv("S3_BUCKET_PREFIX", "")

        # Configure boto3 client
        config = Config(
            region_name=self.region,
            signature_version="s3v4",
        )

        self.client = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=config,
        )

    async def upload(
        self,
        bucket: str,
        key: str,
        data: bytes,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Upload a file to S3."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        bucket_name = f"{self.bucket_prefix}{bucket}"
        extra_args = {}

        if content_type:
            extra_args["ContentType"] = content_type
        if metadata:
            extra_args["Metadata"] = {k: str(v) for k, v in metadata.items()}

        # Run boto3 in thread pool since it's blocking
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as pool:
            await loop.run_in_executor(
                pool,
                lambda: self.client.put_object(
                    Bucket=bucket_name,
                    Key=key,
                    Body=data,
                    **extra_args,
                ),
            )

        return self.get_url(bucket, key)

    async def download(self, bucket: str, key: str) -> bytes:
        """Download a file from S3."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        bucket_name = f"{self.bucket_prefix}{bucket}"

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as pool:
            response = await loop.run_in_executor(
                pool,
                lambda: self.client.get_object(Bucket=bucket_name, Key=key),
            )
            return response["Body"].read()

    async def delete(self, bucket: str, key: str) -> bool:
        """Delete a file from S3."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor

        bucket_name = f"{self.bucket_prefix}{bucket}"

        try:
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as pool:
                await loop.run_in_executor(
                    pool,
                    lambda: self.client.delete_object(Bucket=bucket_name, Key=key),
                )
            return True
        except Exception:
            return False

    async def exists(self, bucket: str, key: str) -> bool:
        """Check if a file exists in S3."""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        from botocore.exceptions import ClientError

        bucket_name = f"{self.bucket_prefix}{bucket}"

        try:
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as pool:
                await loop.run_in_executor(
                    pool,
                    lambda: self.client.head_object(Bucket=bucket_name, Key=key),
                )
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

    def get_url(self, bucket: str, key: str) -> str:
        """Get the URL for a file."""
        bucket_name = f"{self.bucket_prefix}{bucket}"
        
        if self.endpoint_url:
            # Custom S3 endpoint (MinIO, etc.)
            return f"{self.endpoint_url}/{bucket_name}/{key}"
        
        # AWS S3 standard URL
        return f"https://{bucket_name}.s3.{self.region}.amazonaws.com/{key}"

    def get_presigned_url(
        self,
        bucket: str,
        key: str,
        expiration: int = 3600,
    ) -> str:
        """Generate a presigned URL for temporary access."""
        bucket_name = f"{self.bucket_prefix}{bucket}"
        
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket_name, "Key": key},
            ExpiresIn=expiration,
        )


class DesignImageStorage:
    """High-level interface for design image storage.
    
    Provides convenience methods for storing and retrieving design images.
    """

    def __init__(self, backend: Optional[StorageBackend] = None):
        self.backend = backend or get_storage()
        self.bucket = "design-images"

    def _generate_key(self, project_id: str, page_id: str, version: int = 1) -> str:
        """Generate a unique key for a design image."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return f"{project_id}/{page_id}_v{version}_{timestamp}.png"

    async def store_image(
        self,
        project_id: str,
        page_id: str,
        image_data: bytes,
        version: int = 1,
        metadata: Optional[dict] = None,
    ) -> str:
        """Store a design image and return its URL."""
        key = self._generate_key(project_id, page_id, version)
        
        url = await self.backend.upload(
            bucket=self.bucket,
            key=key,
            data=image_data,
            content_type="image/png",
            metadata={
                "project_id": project_id,
                "page_id": page_id,
                "version": str(version),
                **(metadata or {}),
            },
        )
        
        return url

    async def get_image(self, project_id: str, key: str) -> bytes:
        """Get a design image by key."""
        return await self.backend.download(bucket=self.bucket, key=key)

    async def delete_image(self, project_id: str, key: str) -> bool:
        """Delete a design image."""
        return await self.backend.delete(bucket=self.bucket, key=key)

    def get_image_url(self, key: str) -> str:
        """Get the public URL for a design image."""
        return self.backend.get_url(bucket=self.bucket, key=key)

    async def migrate_from_base64(
        self,
        project_id: str,
        page_id: str,
        base64_data: str,
        version: int = 1,
    ) -> str:
        """Migrate a base64-encoded image to object storage.
        
        Returns the new URL of the stored image.
        """
        # Remove data URL prefix if present
        if "," in base64_data:
            base64_data = base64_data.split(",")[1]
        
        image_bytes = base64.b64decode(base64_data)
        
        url = await self.store_image(
            project_id=project_id,
            page_id=page_id,
            image_data=image_bytes,
            version=version,
        )
        
        return url


# Global storage instance
_storage_instance: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Get the configured storage backend."""
    global _storage_instance
    
    if _storage_instance is not None:
        return _storage_instance
    
    # Determine which storage backend to use
    storage_type = os.getenv("STORAGE_BACKEND", "local").lower()
    
    if storage_type == "s3":
        _storage_instance = S3StorageBackend()
    else:
        base_path = os.getenv("LOCAL_STORAGE_PATH", "./uploads")
        _storage_instance = LocalStorageBackend(base_path=base_path)
    
    return _storage_instance


def reset_storage():
    """Reset the storage instance (useful for testing)."""
    global _storage_instance
    _storage_instance = None
