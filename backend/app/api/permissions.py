"""Project permissions API endpoints."""

from fastapi import APIRouter, HTTPException, Depends

from app.db.database import (
    get_project,
    get_project_permissions,
    get_user_by_id,
    remove_project_permission,
    set_project_permission,
)
from app.models.schemas import ProjectPermissionRequest, ProjectPermissionResponse
from app.api.deps import check_project_permission, get_current_user

router = APIRouter(prefix="/api/projects", tags=["permissions"])


@router.get("/{project_id}/permissions", response_model=list[ProjectPermissionResponse])
async def api_get_project_permissions(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get all permissions for a project. Only project owner or admin can view."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return get_project_permissions(project_id)


@router.post("/{project_id}/permissions", response_model=ProjectPermissionResponse)
async def api_set_project_permission(
    project_id: str,
    body: ProjectPermissionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Grant or update a user's permission on a project. Only project owner or admin can do this."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # Only owner or admin can manage permissions
    check_project_permission(project_id, current_user, "owner")

    # Verify target user exists
    target_user = get_user_by_id(body.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="目标用户不存在")

    # Cannot change owner's own permission
    if body.user_id == project.get("owner_id"):
        raise HTTPException(status_code=400, detail="不能修改项目创建者的权限")

    perm = set_project_permission(project_id, body.user_id, body.permission, current_user["id"])
    # Add username and email info
    perm["username"] = target_user.get("username", "")
    perm["email"] = target_user.get("email", "")
    return perm


@router.delete("/{project_id}/permissions/{user_id}")
async def api_remove_project_permission(
    project_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove a user's permission from a project. Only project owner or admin can do this."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    check_project_permission(project_id, current_user, "owner")

    if user_id == project.get("owner_id"):
        raise HTTPException(status_code=400, detail="不能移除项目创建者的权限")

    if not remove_project_permission(project_id, user_id):
        raise HTTPException(status_code=404, detail="权限记录不存在")

    return {"detail": "权限已移除"}
