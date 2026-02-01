"""PRD generation and chat API with SSE streaming."""

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import (
    run_full_pipeline_stream,
    run_revision_pipeline_stream,
    run_design_generation_stream,
)
from app.db.database import (
    append_chat_message,
    append_version_history,
    get_project,
    update_project,
)
from app.models.schemas import ChatRequest

router = APIRouter(prefix="/api/projects", tags=["generation"])


@router.post("/{project_id}/generate")
async def api_generate_prd(project_id: str, body: ChatRequest):
    """Start full PRD generation pipeline.

    Streams SSE events back to the client:
      - status: progress messages
      - requirement: structured requirement JSON
      - pages_plan: page structure JSON
      - token: individual PRD content tokens
      - prd_complete: full PRD content
      - done: pipeline finished
      - result: final aggregated data
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    requirement = body.message
    append_chat_message(project_id, "user", requirement)
    update_project(project_id, status="analyzing", raw_requirement=requirement)

    async def event_stream():
        structured = None
        pages_plan = None
        prd_content = None

        async for event_str in run_full_pipeline_stream(requirement):
            event = json.loads(event_str)

            # Track structured data for DB update
            if event["type"] == "result":
                result_data = json.loads(event["data"])
                structured = result_data.get("structured_requirement")
                pages_plan = result_data.get("pages_plan")
                prd_content = result_data.get("prd_content")

            yield f"data: {event_str}\n\n"

        # Persist results to DB
        if structured or prd_content:
            updates = {"status": "reviewing", "version": project["version"] + 1}
            if structured:
                updates["structured_requirement"] = json.dumps(structured, ensure_ascii=False)
            if pages_plan:
                updates["pages_plan"] = json.dumps(pages_plan, ensure_ascii=False)
            if prd_content:
                updates["prd_content"] = prd_content
                append_chat_message(project_id, "assistant", prd_content)
            update_project(project_id, **updates)
            append_version_history(project_id, "created")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{project_id}/revise")
async def api_revise_prd(project_id: str, body: ChatRequest):
    """Revise existing PRD based on user feedback.

    Streams SSE events similar to generate.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if not project["prd_content"]:
        raise HTTPException(status_code=400, detail="请先生成 PRD")

    feedback = body.message
    append_chat_message(project_id, "user", feedback)
    update_project(project_id, status="revising")

    structured = {}
    if project["structured_requirement"]:
        try:
            structured = json.loads(project["structured_requirement"])
        except json.JSONDecodeError:
            pass

    async def event_stream():
        prd_content = None

        async for event_str in run_revision_pipeline_stream(
            project["prd_content"], structured, feedback
        ):
            event = json.loads(event_str)

            if event["type"] == "result":
                result_data = json.loads(event["data"])
                prd_content = result_data.get("prd_content")

            yield f"data: {event_str}\n\n"

        # Persist
        if prd_content:
            new_version = project["version"] + 1
            update_project(
                project_id,
                status="reviewing",
                version=new_version,
                prd_content=prd_content,
            )
            append_chat_message(project_id, "assistant", prd_content)
            append_version_history(project_id, "revised", feedback)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{project_id}/generate-designs")
async def api_generate_designs(project_id: str):
    """Generate UI design images based on project's PRD and requirement.

    Streams SSE events:
      - status: progress messages
      - image: individual generated image data (page_id, page_name, image_url)
      - done: generation finished with all images
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if not project["prd_content"]:
        raise HTTPException(status_code=400, detail="请先生成 PRD 文档")

    structured = {}
    if project["structured_requirement"]:
        try:
            structured = json.loads(project["structured_requirement"])
        except json.JSONDecodeError:
            pass

    pages_plan = None
    if project["pages_plan"]:
        try:
            pages_plan = json.loads(project["pages_plan"])
        except json.JSONDecodeError:
            pass

    async def event_stream():
        all_images = []

        async for event_str in run_design_generation_stream(
            structured, pages_plan, project["prd_content"]
        ):
            event = json.loads(event_str)

            if event["type"] == "image":
                image_data = json.loads(event["data"])
                all_images.append(image_data)

            yield f"data: {event_str}\n\n"

        # Persist generated images to DB
        if all_images:
            update_project(
                project_id,
                design_images=json.dumps(all_images, ensure_ascii=False),
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
