"""Project CRUD API endpoints."""

from fastapi import APIRouter, HTTPException

from app.db.database import (
    create_project,
    delete_project,
    get_chat_history,
    get_project,
    list_projects,
    update_project,
)
from app.models.schemas import (
    ChatMessage,
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
    project = create_project(body.name, body.description)
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
