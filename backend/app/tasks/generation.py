"""Celery tasks for AI generation operations.

These tasks handle long-running AI generation operations asynchronously,
allowing the API to respond immediately while the work continues in
the background.

Usage:
    # Submit a generation task
    task = generate_prd_task.delay(project_id, requirement)
    
    # Check task status
    result = generate_prd_task.AsyncResult(task.id)
    
    # Poll for completion
    while not result.ready():
        time.sleep(1)
    
    # Get final result
    if result.successful():
        print(result.result)
"""

import json
import logging
from typing import Optional

from celery import current_task
from celery.exceptions import SoftTimeLimitExceeded

from app.core.celery_app import celery_app
from app.db.database import (
    get_project,
    update_project,
    append_chat_message,
    save_prd_version,
    save_design_version,
)
from app.agents.orchestrator import (
    analyze_requirement,
    plan_pages,
    generate_page_images,
)
from app.agents.image_generator import generate_image

logger = logging.getLogger(__name__)


def _update_task_state(state: str, meta: dict):
    """Update Celery task state with progress information."""
    if current_task:
        current_task.update_state(state=state, meta=meta)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    time_limit=1800,  # 30 minutes
    soft_time_limit=1500,  # 25 minutes
)
def generate_prd_task(
    self,
    project_id: str,
    requirement: str,
    chat_model: Optional[str] = None,
) -> dict:
    """Generate PRD document asynchronously.
    
    This task performs the full PRD generation pipeline:
    1. Analyze requirements
    2. Generate prototype pages
    3. Generate PRD content
    
    Args:
        project_id: The project ID
        requirement: The user requirement text
        chat_model: Optional chat model to use
        
    Returns:
        Dict with generation results
    """
    try:
        # Update task state
        _update_task_state("STARTED", {"step": "initializing", "progress": 0})
        
        # Update project status
        update_project(project_id, status="analyzing")
        
        # Step 1: Analyze requirements
        _update_task_state("PROGRESS", {"step": "analyzing", "progress": 10})
        logger.info(f"[Task {self.request.id}] Analyzing requirements for project {project_id}")
        
        import asyncio
        structured = asyncio.run(analyze_requirement(requirement, chat_model=chat_model))
        
        _update_task_state("PROGRESS", {"step": "analyzing_complete", "progress": 30})
        update_project(
            project_id,
            status="prototyping",
            structured_requirement=json.dumps(structured, ensure_ascii=False),
        )
        
        # Step 2: Generate prototype pages
        _update_task_state("PROGRESS", {"step": "prototyping", "progress": 40})
        logger.info(f"[Task {self.request.id}] Generating prototype pages")
        
        pages_plan = asyncio.run(plan_pages(structured, chat_model=chat_model))
        
        _update_task_state("PROGRESS", {"step": "prototyping_complete", "progress": 60})
        update_project(
            project_id,
            status="generating",
            pages_plan=json.dumps(pages_plan, ensure_ascii=False),
        )
        
        # Step 3: Generate PRD content
        _update_task_state("PROGRESS", {"step": "generating_prd", "progress": 70})
        logger.info(f"[Task {self.request.id}] Generating PRD content")
        
        from app.agents.orchestrator import generate_prd
        prd_content = asyncio.run(generate_prd(
            structured,
            pages_plan,
            chat_model=chat_model,
        ))
        
        # Save results
        _update_task_state("PROGRESS", {"step": "saving", "progress": 90})
        
        # Get current project to determine version
        project = get_project(project_id)
        new_version = (project.get("version", 0) or 0) + 1
        
        update_project(
            project_id,
            status="reviewing",
            prd_content=prd_content,
            version=new_version,
        )
        
        # Save version history
        save_prd_version(project_id, prd_content)
        
        # Add system message to chat history
        append_chat_message(
            project_id,
            "assistant",
            "PRD 文档已生成完成，请在左侧查看。",
        )
        
        _update_task_state("SUCCESS", {"step": "complete", "progress": 100})
        
        return {
            "success": True,
            "project_id": project_id,
            "version": new_version,
            "structured_requirement": structured,
            "pages_plan": pages_plan,
            "prd_content_preview": prd_content[:500] if prd_content else "",
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"[Task {self.request.id}] Soft time limit exceeded")
        update_project(project_id, status="error")
        raise
    except Exception as exc:
        logger.exception(f"[Task {self.request.id}] Generation failed: {exc}")
        update_project(project_id, status="error")
        
        # Retry on failure
        if self.request.retries < self.max_retries:
            logger.info(f"[Task {self.request.id}] Retrying... ({self.request.retries + 1}/{self.max_retries})")
            raise self.retry(exc=exc)
        
        raise


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    time_limit=600,  # 10 minutes per image
    soft_time_limit=540,  # 9 minutes
)
def generate_design_image_task(
    self,
    project_id: str,
    page_id: str,
    page_name: str,
    page_description: str,
    image_model: Optional[str] = None,
    global_style: Optional[str] = None,
) -> dict:
    """Generate a single design image asynchronously.
    
    Args:
        project_id: The project ID
        page_id: The page ID
        page_name: Name of the page
        page_description: Description of the page
        image_model: Optional image model to use
        global_style: Optional global style requirements
        
    Returns:
        Dict with image URL and metadata
    """
    try:
        _update_task_state("STARTED", {"step": "generating_image", "page_id": page_id})
        
        # Build prompt
        prompt = f"UI/UX design for {page_name}: {page_description}"
        if global_style:
            prompt += f". Style: {global_style}"
        
        logger.info(f"[Task {self.request.id}] Generating image for page {page_id}")
        
        # Generate image
        import asyncio
        image_result = asyncio.run(generate_image(prompt, model=image_model))
        
        # TODO: Store image in object storage and get URL
        # For now, return base64 (should be migrated to use file_storage)
        image_data = {
            "page_id": page_id,
            "page_name": page_name,
            "url": image_result.get("url", ""),
            "prompt": prompt,
            "generated_at": image_result.get("created_at"),
        }
        
        _update_task_state("SUCCESS", {"step": "complete", "page_id": page_id})
        
        return {
            "success": True,
            "project_id": project_id,
            "image": image_data,
        }
        
    except Exception as exc:
        logger.exception(f"[Task {self.request.id}] Image generation failed: {exc}")
        
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        
        raise


@celery_app.task(
    bind=True,
    time_limit=3600,  # 1 hour for batch generation
    soft_time_limit=3300,  # 55 minutes
)
def generate_all_designs_task(
    self,
    project_id: str,
    pages: list[dict],
    image_model: Optional[str] = None,
    global_style: Optional[str] = None,
) -> dict:
    """Generate all design images for a project asynchronously.
    
    Args:
        project_id: The project ID
        pages: List of page dicts with id, name, description
        image_model: Optional image model to use
        global_style: Optional global style requirements
        
    Returns:
        Dict with all image URLs
    """
    results = []
    total = len(pages)
    
    for idx, page in enumerate(pages):
        progress = int((idx / total) * 100)
        _update_task_state("PROGRESS", {
            "step": f"generating_page_{idx + 1}_of_{total}",
            "progress": progress,
            "current_page": page.get("name"),
        })
        
        try:
            # Generate image for this page
            result = generate_design_image_task(
                project_id=project_id,
                page_id=page["id"],
                page_name=page["name"],
                page_description=page.get("description", ""),
                image_model=image_model,
                global_style=global_style,
            )
            
            results.append(result)
            
        except Exception as exc:
            logger.error(f"Failed to generate image for page {page['id']}: {exc}")
            results.append({
                "page_id": page["id"],
                "error": str(exc),
            })
    
    _update_task_state("SUCCESS", {"step": "complete", "progress": 100})
    
    return {
        "success": True,
        "project_id": project_id,
        "total": total,
        "completed": len([r for r in results if r.get("success")]),
        "images": results,
    }


@celery_app.task
def cleanup_old_tasks_task():
    """Cleanup old task results from the result backend.
    
    This should be scheduled to run periodically (e.g., daily).
    """
    from app.core.celery_app import celery_app
    
    # Purge old results
    celery_app.backend.cleanup()
    
    logger.info("Cleaned up old task results")
    
    return {"status": "success"}
