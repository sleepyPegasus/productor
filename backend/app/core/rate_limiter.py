"""Rate limiting for API endpoints.

Provides rate limiting based on user ID or IP address.
Uses in-memory storage by default, can be extended to use Redis.
"""

import time
from typing import Optional
from dataclasses import dataclass, field
from threading import Lock
from functools import wraps

from fastapi import Request, HTTPException, status


@dataclass
class RateLimitEntry:
    """Rate limit tracking for a single client."""
    requests: int = 0
    window_start: float = field(default_factory=time.time)
    lock: Lock = field(default_factory=Lock)


class RateLimiter:
    """In-memory rate limiter with sliding window.
    
    Usage:
        limiter = RateLimiter(requests_per_minute=10)
        
        @router.post("/generate")
        async def generate(request: Request):
            client_id = limiter.get_client_id(request)
            if not limiter.is_allowed(client_id):
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
            # ... proceed with request
    """

    def __init__(
        self,
        requests_per_minute: int = 60,
        window_seconds: int = 60,
        burst_size: Optional[int] = None,
    ):
        """Initialize rate limiter.
        
        Args:
            requests_per_minute: Maximum requests allowed per window
            window_seconds: Time window in seconds (default 60)
            burst_size: Allow burst requests (default = requests_per_minute)
        """
        self.requests_per_minute = requests_per_minute
        self.window_seconds = window_seconds
        self.burst_size = burst_size or requests_per_minute
        self._storage: dict[str, RateLimitEntry] = {}
        self._global_lock = Lock()

    def get_client_id(self, request: Request) -> str:
        """Extract client identifier from request.
        
        Priority:
        1. X-Forwarded-For header (for proxied requests)
        2. X-Real-IP header
        3. request.client.host
        4. Authorization token user ID (if available)
        """
        # Check forwarded headers first (for deployments behind proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fall back to direct client IP
        if request.client:
            return request.client.host
        
        return "unknown"

    def is_allowed(self, client_id: str) -> bool:
        """Check if request is allowed for client.
        
        Returns True if request is within rate limit, False otherwise.
        """
        now = time.time()
        
        with self._global_lock:
            entry = self._storage.get(client_id)
            
            if entry is None:
                # First request from this client
                self._storage[client_id] = RateLimitEntry(
                    requests=1,
                    window_start=now,
                )
                return True
            
            with entry.lock:
                # Check if window has expired
                if now - entry.window_start > self.window_seconds:
                    # Reset window
                    entry.requests = 1
                    entry.window_start = now
                    return True
                
                # Check burst limit
                if entry.requests < self.burst_size:
                    entry.requests += 1
                    return True
                
                # Rate limit exceeded
                return False

    def get_remaining(self, client_id: str) -> int:
        """Get remaining requests for client in current window."""
        entry = self._storage.get(client_id)
        if not entry:
            return self.burst_size
        
        now = time.time()
        if now - entry.window_start > self.window_seconds:
            return self.burst_size
        
        return max(0, self.burst_size - entry.requests)

    def get_reset_time(self, client_id: str) -> float:
        """Get timestamp when rate limit resets for client."""
        entry = self._storage.get(client_id)
        if not entry:
            return time.time()
        
        return entry.window_start + self.window_seconds

    def cleanup_old_entries(self, max_age_seconds: int = 3600):
        """Remove old entries to prevent memory leak.
        
        Should be called periodically (e.g., by a background task).
        """
        now = time.time()
        with self._global_lock:
            expired = [
                client_id
                for client_id, entry in self._storage.items()
                if now - entry.window_start > max_age_seconds
            ]
            for client_id in expired:
                del self._storage[client_id]


# Global rate limiter instances with different limits
# AI generation endpoints - stricter limits due to API costs
generation_limiter = RateLimiter(
    requests_per_minute=10,
    window_seconds=60,
    burst_size=5,
)

# Standard API endpoints
standard_limiter = RateLimiter(
    requests_per_minute=120,
    window_seconds=60,
    burst_size=20,
)

# Auth endpoints - more permissive but still protected
auth_limiter = RateLimiter(
    requests_per_minute=30,
    window_seconds=60,
    burst_size=10,
)


def rate_limit(
    limiter: RateLimiter,
    get_client_id_func=None,
):
    """Decorator for rate limiting FastAPI endpoints.
    
    Usage:
        @router.post("/generate")
        @rate_limit(generation_limiter)
        async def generate(request: Request):
            pass
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Find Request object in args or kwargs
            request: Optional[Request] = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                request = kwargs.get("request")
            
            if request:
                if get_client_id_func:
                    client_id = get_client_id_func(request, *args, **kwargs)
                else:
                    client_id = limiter.get_client_id(request)
                
                if not limiter.is_allowed(client_id):
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail={
                            "error": "RATE_LIMIT_EXCEEDED",
                            "message": "请求过于频繁，请稍后再试",
                            "retry_after": int(limiter.get_reset_time(client_id) - time.time()),
                        },
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


class RateLimitMiddleware:
    """ASGI middleware for global rate limiting.
    
    Usage:
        from app.core.rate_limiter import RateLimitMiddleware, standard_limiter
        
        app.add_middleware(
            RateLimitMiddleware,
            limiter=standard_limiter,
            exempt_paths=["/api/health", "/api/auth/login"],
        )
    """

    def __init__(
        self,
        app,
        limiter: RateLimiter,
        exempt_paths: Optional[list[str]] = None,
    ):
        self.app = app
        self.limiter = limiter
        self.exempt_paths = exempt_paths or []

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        
        # Check exempt paths
        for exempt_path in self.exempt_paths:
            if path.startswith(exempt_path):
                await self.app(scope, receive, send)
                return

        # Extract client ID from scope
        headers = dict(scope.get("headers", []))
        client_id = self._get_client_id_from_scope(scope, headers)
        
        if not self.limiter.is_allowed(client_id):
            await self._send_rate_limit_response(send, client_id)
            return

        await self.app(scope, receive, send)

    def _get_client_id_from_scope(self, scope, headers):
        """Extract client ID from ASGI scope."""
        # Check forwarded headers
        forwarded = headers.get(b"x-forwarded-for", b"").decode()
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = headers.get(b"x-real-ip", b"").decode()
        if real_ip:
            return real_ip
        
        # Fall back to client address
        client = scope.get("client")
        if client:
            return client[0]
        
        return "unknown"

    async def _send_rate_limit_response(self, send, client_id):
        """Send 429 response."""
        retry_after = int(self.limiter.get_reset_time(client_id) - time.time())
        
        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": [
                [b"content-type", b"application/json"],
                [b"retry-after", str(retry_after).encode()],
            ],
        })
        
        body = f'{{"error": "RATE_LIMIT_EXCEEDED", "message": "请求过于频繁，请稍后再试", "retry_after": {retry_after}}}'
        await send({
            "type": "http.response.body",
            "body": body.encode(),
        })
