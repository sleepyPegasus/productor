"""User management API endpoints."""

from fastapi import APIRouter, HTTPException, Depends

from app.db.database import (
    delete_user,
    get_user_by_id,
    list_users,
    update_user,
    update_user_password,
)
from app.models.schemas import UserResponse, UserUpdateRequest
from app.api.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def api_list_users(current_user: dict = Depends(require_admin)):
    """List all users (admin only)."""
    return list_users()


@router.get("/{user_id}", response_model=UserResponse)
async def api_get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get user info. Users can view their own info; admins can view any user."""
    if user_id != current_user["id"] and not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="权限不足")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def api_update_user(user_id: str, body: UserUpdateRequest, current_user: dict = Depends(require_admin)):
    """Update user status (admin only). Can enable/disable users or change admin status."""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return user
    # Convert bool to int for sqlite
    if "is_active" in updates:
        updates["is_active"] = 1 if updates["is_active"] else 0
    if "is_admin" in updates:
        updates["is_admin"] = 1 if updates["is_admin"] else 0
    updated = update_user(user_id, **updates)
    return updated


@router.delete("/{user_id}")
async def api_delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    """Delete a user (admin only). Cannot delete admin users."""
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.get("is_admin"):
        raise HTTPException(status_code=400, detail="不能删除管理员账号")
    if not delete_user(user_id):
        raise HTTPException(status_code=400, detail="删除失败")
    return {"detail": "用户已删除"}


@router.post("/{user_id}/reset-password")
async def api_reset_user_password(user_id: str, current_user: dict = Depends(require_admin)):
    """Reset a user's password to default '123456' (admin only)."""
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    update_user_password(user_id, "123456")
    return {"detail": "密码已重置为 123456"}
