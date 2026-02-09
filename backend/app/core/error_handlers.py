"""Global error handlers for FastAPI application.

Registers exception handlers with the FastAPI app for consistent
error responses across all endpoints.
"""

import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
import sqlite3

from app.core.exceptions import AppException

logger = logging.getLogger(__name__)


def setup_error_handlers(app):
    """Register all error handlers with the FastAPI app."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        """Handle custom application exceptions."""
        logger.warning(
            "AppException: %s - %s (path: %s)",
            exc.error_code,
            exc.message,
            request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        """Handle FastAPI request validation errors."""
        errors = []
        for error in exc.errors():
            error_msg = {
                "field": ".".join(str(x) for x in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
            errors.append(error_msg)

        logger.warning(
            "Validation error on %s: %s", request.url.path, errors
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": "VALIDATION_ERROR",
                "message": "请求参数验证失败",
                "details": {"errors": errors},
            },
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(request: Request, exc: ValidationError):
        """Handle Pydantic validation errors."""
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(x) for x in error["loc"]),
                "message": error["msg"],
            })

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": "VALIDATION_ERROR",
                "message": "数据验证失败",
                "details": {"errors": errors},
            },
        )

    @app.exception_handler(sqlite3.IntegrityError)
    async def sqlite_integrity_handler(request: Request, exc: sqlite3.IntegrityError):
        """Handle SQLite integrity errors (duplicates, foreign keys, etc.)."""
        error_msg = str(exc).lower()

        if "unique" in error_msg or "duplicate" in error_msg:
            message = "资源已存在"
            error_code = "DUPLICATE_RESOURCE"
            status_code = status.HTTP_409_CONFLICT
        elif "foreign key" in error_msg:
            message = "关联资源不存在"
            error_code = "FOREIGN_KEY_VIOLATION"
            status_code = status.HTTP_400_BAD_REQUEST
        else:
            message = "数据库约束错误"
            error_code = "INTEGRITY_ERROR"
            status_code = status.HTTP_400_BAD_REQUEST

        logger.warning(
            "SQLite integrity error on %s: %s", request.url.path, exc
        )
        return JSONResponse(
            status_code=status_code,
            content={
                "success": False,
                "error": error_code,
                "message": message,
                "details": {"original_error": str(exc)},
            },
        )

    @app.exception_handler(sqlite3.Error)
    async def sqlite_error_handler(request: Request, exc: sqlite3.Error):
        """Handle general SQLite errors."""
        logger.error(
            "SQLite error on %s: %s", request.url.path, exc, exc_info=True
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": "DATABASE_ERROR",
                "message": "数据库操作失败",
                "details": {},
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Handle all unhandled exceptions."""
        logger.error(
            "Unhandled exception on %s: %s", request.url.path, exc, exc_info=True
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": "INTERNAL_SERVER_ERROR",
                "message": "服务器内部错误",
                "details": {},
            },
        )


class APIResponse:
    """Helper class for creating consistent API responses."""

    @staticmethod
    def success(data: any = None, message: str = "Success"):
        """Create a successful response."""
        response = {
            "success": True,
            "message": message,
        }
        if data is not None:
            response["data"] = data
        return response

    @staticmethod
    def error(
        message: str,
        error_code: str = "ERROR",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict = None,
    ):
        """Create an error response."""
        return JSONResponse(
            status_code=status_code,
            content={
                "success": False,
                "error": error_code,
                "message": message,
                "details": details or {},
            },
        )

    @staticmethod
    def paginated(
        items: list,
        total: int,
        page: int = 1,
        page_size: int = 20,
    ):
        """Create a paginated response."""
        return {
            "success": True,
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }
