"""Shared auth dependencies for API routes."""

from datetime import datetime, timezone, timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings
from app.db.database import get_user_by_id, get_user_permission_for_project

security = HTTPBearer(auto_error=False)


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="未登录")
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的认证令牌")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="账号已被禁用")
    return user


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


def check_project_permission(project_id: str, user: dict, required_level: str = "view") -> str:
    """Check if user has required permission level on a project.

    Permission hierarchy: owner > edit > view
    Admin users always have owner-level access.
    Returns the actual permission level.
    """
    if user.get("is_admin"):
        return "owner"

    permission = get_user_permission_for_project(project_id, user["id"])
    if not permission:
        raise HTTPException(status_code=403, detail="您没有访问此项目的权限")

    level_order = {"view": 0, "edit": 1, "owner": 2}
    if level_order.get(permission, -1) < level_order.get(required_level, 0):
        raise HTTPException(status_code=403, detail="权限不足")

    return permission
