"""Project CRUD API endpoints."""

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.db.database import (
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
    list_projects,
    save_comprehensive_version,
    save_prd_version,
    update_comprehensive_content,
    update_project,
)
from app.models.schemas import (
    ChatMessage,
    ModelsResponse,
    PrdContentUpdate,
    ProjectCreate,
    ProjectListItem,
    ProjectResponse,
    ProjectUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=list[ProjectListItem])
async def api_list_projects():
    return list_projects()


@router.post("", response_model=ProjectResponse)
async def api_create_project(body: ProjectCreate):
    project = create_project(
        body.name,
        body.description,
        chat_model=body.chat_model,
        image_model=body.image_model,
        default_image_resolution=body.default_image_resolution,
        default_image_ratio=body.default_image_ratio,
    )
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def api_get_project(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def api_update_project(project_id: str, body: ProjectUpdate):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return project
    updated = update_project(project_id, **updates)
    return updated


@router.delete("/{project_id}")
async def api_delete_project(project_id: str):
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"detail": "已删除"}


@router.get("/{project_id}/chat", response_model=list[ChatMessage])
async def api_get_chat_history(project_id: str):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return get_chat_history(project_id)


# PRD content editing and versioning
@router.put("/{project_id}/prd-content")
async def api_update_prd_content(project_id: str, body: PrdContentUpdate):
    """Update PRD content (manual edit) and save version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    # Save current content as version before updating
    if project.get("prd_content"):
        save_prd_version(project_id, project["prd_content"], "auto_save")
    # Save new content
    new_version = project["version"] + 1
    updated = update_project(project_id, prd_content=body.content, version=new_version)
    save_prd_version(project_id, body.content, "manual_edit")
    return updated


@router.get("/{project_id}/prd-versions")
async def api_get_prd_versions(project_id: str):
    """Get list of PRD version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return get_prd_versions(project_id)


@router.get("/{project_id}/prd-versions/{version}")
async def api_get_prd_version_content(project_id: str, version: int):
    """Get PRD content for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    content = get_prd_version_content(project_id, version)
    if content is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "content": content}


# Design version history
@router.get("/{project_id}/design-versions")
async def api_get_design_versions(project_id: str):
    """Get list of design version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return get_design_versions(project_id)


@router.get("/{project_id}/design-versions/{version}")
async def api_get_design_version_images(project_id: str, version: int):
    """Get design images for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    images = get_design_version_images(project_id, version)
    if images is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "images": images}


# Comprehensive solution versioning
@router.get("/{project_id}/comprehensive-versions")
async def api_get_comprehensive_versions(project_id: str):
    """Get list of comprehensive solution version snapshots."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return get_comprehensive_versions(project_id)


@router.get("/{project_id}/comprehensive-versions/{version}")
async def api_get_comprehensive_version_content(project_id: str, version: int):
    """Get comprehensive solution content for a specific version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    content = get_comprehensive_version_content(project_id, version)
    if content is None:
        raise HTTPException(status_code=404, detail="版本不存在")
    return {"version": version, "content": content}


@router.put("/{project_id}/comprehensive-content")
async def api_update_comprehensive_content(project_id: str, body: PrdContentUpdate):
    """Update comprehensive solution content (manual edit) and save version."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    # Save current content as auto_save before updating
    current = project.get("comprehensive_content", "")
    if current:
        save_comprehensive_version(project_id, current, "auto_save")
    # Save new content
    update_comprehensive_content(project_id, body.content)
    save_comprehensive_version(project_id, body.content, "manual_edit")
    return {"detail": "综合方案内容已保存"}
