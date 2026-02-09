"""Task management API endpoints.

Provides endpoints for submitting and monitoring background tasks.
"""

from fastapi import APIRouter, HTTPException, Depends

from app.api.deps import get_current_user
from app.core.celery_app import get_task_status, check_celery_health
from app.tasks.generation import (
    generate_prd_task,
    generate_design_image_task,
    generate_all_designs_task,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/health")
async def celery_health_check():
    """Check Celery worker health status."""
    return check_celery_health()


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get the status and result of a background task."""
    return get_task_status(task_id)


@router.post("/projects/{project_id}/generate-prd")
async def submit_prd_generation_task(
    project_id: str,
    requirement: str,
    chat_model: str = None,
    current_user: dict = Depends(get_current_user),
):
    """Submit a PRD generation task.
    
    Returns immediately with a task ID. Use GET /tasks/{task_id} to poll for status.
    """
    # Submit task to Celery
    task = generate_prd_task.delay(
        project_id=project_id,
        requirement=requirement,
        chat_model=chat_model,
    )
    
    return {
        "task_id": task.id,
        "status": "PENDING",
        "message": "Task submitted successfully",
        "check_status_url": f"/api/tasks/{task.id}",
    }


@router.post("/projects/{project_id}/generate-designs")
async def submit_design_generation_task(
    project_id: str,
    pages: list[dict],
    image_model: str = None,
    global_style: str = None,
    current_user: dict = Depends(get_current_user),
):
    """Submit a batch design generation task.
    
    Returns immediately with a task ID. Use GET /tasks/{task_id} to poll for status.
    """
    task = generate_all_designs_task.delay(
        project_id=project_id,
        pages=pages,
        image_model=image_model,
        global_style=global_style,
    )
    
    return {
        "task_id": task.id,
        "status": "PENDING",
        "message": "Task submitted successfully",
        "check_status_url": f"/api/tasks/{task.id}",
    }
