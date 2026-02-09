"""Celery configuration for background task processing.

This module configures Celery for handling long-running tasks like
AI generation. Tasks can be executed asynchronously, allowing the
API to respond immediately while the work continues in the background.

Usage:
    from app.core.celery_app import celery_app, generate_prd_task
    
    # Submit a task
    task = generate_prd_task.delay(project_id, requirement)
    
    # Get task status
    result = generate_prd_task.AsyncResult(task.id)
    print(result.status)  # PENDING, STARTED, SUCCESS, FAILURE
    
    # Get result (when complete)
    if result.ready():
        print(result.result)
"""

import os
from typing import Optional

from celery import Celery
from celery.signals import task_prerun, task_postrun

# Celery configuration
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

# Create Celery app
celery_app = Celery(
    "productor",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.tasks.generation"],  # Task modules to import
)

# Celery configuration
celery_app.conf.update(
    # Task serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Task execution
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes max
    task_soft_time_limit=1500,  # 25 minutes soft limit
    
    # Result backend
    result_expires=3600 * 24,  # Results expire after 24 hours
    result_extended=True,
    
    # Worker settings
    worker_prefetch_multiplier=1,  # Don't prefetch tasks (good for long tasks)
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks
    
    # Task routes - route generation tasks to dedicated queue
    task_routes={
        "app.tasks.generation.*": {"queue": "generation"},
    },
    
    # Task default queue
    task_default_queue="default",
    
    # Retry settings
    task_default_retry_delay=60,  # 1 minute
    task_max_retries=3,
)


# Task monitoring signals
@task_prerun.connect
def task_prerun_handler(task_id, task, args, kwargs, **extras):
    """Called before task starts."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Task {task.name}[{task_id}] started")


@task_postrun.connect
def task_postrun_handler(task_id, task, args, kwargs, retval, state, **extras):
    """Called after task completes."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Task {task.name}[{task_id}] finished with state: {state}")


# Health check function
def check_celery_health() -> dict:
    """Check if Celery workers are running.
    
    Returns a dict with status information.
    """
    try:
        # Ping workers
        inspect = celery_app.control.inspect()
        active = inspect.active()
        stats = inspect.stats()
        
        return {
            "status": "healthy" if active else "no_workers",
            "workers": list(stats.keys()) if stats else [],
            "active_tasks": sum(len(t) for t in active.values()) if active else 0,
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
        }


def get_task_status(task_id: str) -> dict:
    """Get the status of a task.
    
    Returns a dict with task information.
    """
    from celery.result import AsyncResult
    
    result = AsyncResult(task_id, app=celery_app)
    
    response = {
        "task_id": task_id,
        "status": result.status,
        "ready": result.ready(),
    }
    
    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            response["error"] = str(result.result)
    
    return response
