"""Project CRUD API endpoints."""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends

from app.config import settings
from app.db.database import (
    archive_project,
    create_project,
    delete_project,
    get_chat_history,
    get_comprehensive_version_content,
    get_comprehensive_versions,
    get_design_version_images,
    get_design_versions,
    get_prd_version_content,
    get_prd_versions,
    get_project,
    list_projects_for_user,
    permanently_delete_project,
    restore_project,
    save_comprehensive_version,
    save_prd_version,
    update_chat_history,
    update_comprehensive_content,
    update_project,
)
from app.models.schemas import (
    ChatHistoryUpdate,
    ChatMessage,
    ModelsResponse,
    PrdContentUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectResponse,
    ProjectUpdate,
)
from app.api.deps import get_current_user, check_project_permission

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectListItem])
async def api_list_projects(
    category: Optional[str] = Query("active", description="Filter by category: active, archived, deleted"),
    search: Optional[str] = Query("", description="Search keyword for name/description"),
    current_user: dict = Depends(get_current_user),
):
    return list_projects_for_user(
        current_user["id"],
        category=category or "active",
        search=search or "",
    )


@router.post("", response_model=ProjectResponse)
async def api_create_project(body: ProjectCreate, current_user: dict = Depends(get_current_user)):
    project = create_project(
        body.name,
        body.description,
        chat_model=body.chat_model,
        image_model=body.image_model,
        comprehensive_model=body.comprehensive_model,
        default_image_resolution=body.default_image_resolution,
        default_image_ratio=body.default_image_ratio,
        owner_id=current_user["id"],
    )
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def api_get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def api_update_project(project_id: str, body: ProjectUpdate, current_user: dict = Depends(get_current_user)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return project
    updated = update_project(project_id, **updates)
    return updated


@router.delete("/{project_id}")
async def api_delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    check_project_permission(project_id, current_user, "owner")
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"detail": "已删除"}


@router.post("/{project_id}/archive")
async def api_archive_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "owner")
    archive_project(project_id)
    return {"detail": "已归档"}


@router.post("/{project_id}/restore")
async def api_restore_project(project_id: str, current_user: dict = Depends(get_current_user)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "owner")
    restore_project(project_id)
    return {"detail": "已恢复"}


@router.delete("/{project_id}/permanent")
async def api_permanently_delete_project(project_id: str, current_user: dict = Depends(get_current_user)):
    check_project_permission(project_id, current_user, "owner")
    if not permanently_delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"detail": "已永久删除"}


@router.get("/{project_id}/chat", response_model=list[ChatMessage])
async def api_get_chat_history(project_id: str, current_user: dict = Depends(get_current_user)):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return get_chat_history(project_id)


@router.put("/{project_id}/chat")
async def api_update_chat_history(project_id: str, body: ChatHistoryUpdate, current_user: dict = Depends(get_current_user)):
    """Update (replace) chat history, used for deleting selected messages."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")
    messages = [m.model_dump() for m in body.messages]
    update_chat_history(project_id, messages)
    return {"detail": "对话记录已更新"}


# PRD content editing and versioning
@router.put("/{project_id}/prd-content")
async def api_update_prd_content(project_id: str, body: PrdContentUpdate, current_user: dict = Depends(get_current_user)):
    """Update PRD content (manual edit) and save version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")
    # Save current content as version before updating
    if project.get("prd_content"):
        save_prd_version(project_id, project["prd_content"], "auto_save")
    # Save new content
    new_version = project["version"] + 1
    updated = update_project(project_id, prd_content=body.content, version=new_version)
    save_prd_version(project_id, body.content, "manual_edit")
    return updated


@router.get("/{project_id}/prd-versions")
async def api_get_prd_versions(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get list of PRD version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return get_prd_versions(project_id)


@router.get("/{project_id}/prd-versions/{version}")
async def api_get_prd_version_content(project_id: str, version: int, current_user: dict = Depends(get_current_user)):
    """Get PRD content for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    content = get_prd_version_content(project_id, version)
    if content is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "content": content}


# Design version history
@router.get("/{project_id}/design-versions")
async def api_get_design_versions(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get list of design version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return get_design_versions(project_id)


@router.get("/{project_id}/design-versions/{version}")
async def api_get_design_version_images(project_id: str, version: int, current_user: dict = Depends(get_current_user)):
    """Get design images for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    images = get_design_version_images(project_id, version)
    if images is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "images": images}


# Comprehensive solution versioning
@router.get("/{project_id}/comprehensive-versions")
async def api_get_comprehensive_versions(project_id: str, current_user: dict = Depends(get_current_user)):
    """Get list of comprehensive solution version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    return get_comprehensive_versions(project_id)


@router.get("/{project_id}/comprehensive-versions/{version}")
async def api_get_comprehensive_version_content(project_id: str, version: int, current_user: dict = Depends(get_current_user)):
    """Get comprehensive solution content for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "view")
    content = get_comprehensive_version_content(project_id, version)
    if content is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "content": content}


@router.put("/{project_id}/comprehensive-content")
async def api_update_comprehensive_content(project_id: str, body: PrdContentUpdate, current_user: dict = Depends(get_current_user)):
    """Update comprehensive solution content (manual edit) and save version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")
    # Save current content as auto_save before updating
    current = project.get("comprehensive_content", "")
    if current:
        save_comprehensive_version(project_id, current, "auto_save")
    # Save new content
    update_comprehensive_content(project_id, body.content)
    save_comprehensive_version(project_id, body.content, "manual_edit")
    return {"detail": "综合方案内容已保存"}
