"""PRD generation and chat API with SSE streaming."""

import json
import logging

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from openai import AuthenticationError as OpenAIAuthError
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from app.agents.orchestrator import (
    ai_fill_page_content_stream,
    consolidate_comprehensive_stream,
    run_full_pipeline_stream,
    run_revision_pipeline_stream,
    run_design_generation_stream,
    run_single_page_design_stream,
)
from app.core.rate_limiter import generation_limiter, rate_limit
from app.db.database import (
    append_chat_message,
    append_version_history,
    get_project,
    save_comprehensive_version,
    save_design_version,
    save_prd_version,
    update_project,
)
from app.models.schemas import ChatRequest, ReviseWithVersionRequest
from app.api.deps import get_current_user, check_project_permission

router = APIRouter(prefix="/api/projects", tags=["generation"])


class SinglePageDesignRequest(BaseModel):
    page_id: str = Field(..., min_length=1)
    image_resolution: str = Field(default="", description="Image resolution e.g. '1920x1080'")
    image_ratio: str = Field(default="", description="Image aspect ratio e.g. '16:9'")
    image_extra_requirements: str = Field(default="", description="Additional requirements for image generation")
    reference_image: str = Field(default="", description="Reference image as base64 data URL for guiding generation")


@router.post("/{project_id}/generate")
@rate_limit(generation_limiter)
async def api_generate_prd(
    project_id: str,
    body: ChatRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Start full PRD generation pipeline."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    requirement = body.message
    append_chat_message(project_id, "user", requirement)
    update_project(project_id, status="analyzing", raw_requirement=requirement)

    chat_model = project.get("chat_model") or None
    image_model = project.get("image_model") or None

    async def event_stream():
        structured = None
        pages_plan = None
        prd_content = None
        has_error = False

        try:
            async for event_str in run_full_pipeline_stream(
                requirement, chat_model=chat_model, image_model=image_model
            ):
                event = json.loads(event_str)

                # Track structured data for DB update
                if event["type"] == "result":
                    result_data = json.loads(event["data"])
                    structured = result_data.get("structured_requirement")
                    pages_plan = result_data.get("pages_plan")
                    prd_content = result_data.get("prd_content")

                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            has_error = True
            logger.error("LLM authentication error during generation: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            has_error = True
            logger.error("Unexpected error during generation: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'data': f'生成过程中发生错误: {str(e)}'})}\n\n"
        finally:
            # Persist results to DB - runs on success, error, or client disconnect
            if has_error:
                update_project(project_id, status="error")
            elif structured or prd_content:
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
                if prd_content:
                    save_prd_version(project_id, prd_content, "generated")

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
async def api_revise_prd(project_id: str, body: ReviseWithVersionRequest, current_user: dict = Depends(get_current_user)):
    """Revise existing PRD based on user feedback."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    if not project["prd_content"]:
        raise HTTPException(status_code=400, detail="请先生成 PRD")

    feedback = body.message
    append_chat_message(project_id, "user", feedback)
    update_project(project_id, status="revising")

    chat_model = project.get("chat_model") or None

    structured = {}
    if project["structured_requirement"]:
        try:
            structured = json.loads(project["structured_requirement"])
        except json.JSONDecodeError:
            pass

    # Use specific version content if requested
    target_prd = project["prd_content"]
    if body.version is not None:
        from app.db.database import get_prd_version_content
        version_content = get_prd_version_content(project_id, body.version)
        if version_content:
            target_prd = version_content

    # Build targeted feedback if a section is selected
    effective_feedback = feedback
    if body.section:
        effective_feedback = (
            f"[用户选择了PRD文档中的「{body.section}」部分进行针对性修改]\n\n"
            f"用户要求：{feedback}\n\n"
            f"请重点修改「{body.section}」部分的内容，其他部分尽量保持不变。"
            f"输出完整的修改后的PRD文档。"
        )

    async def event_stream():
        prd_content = None
        has_error = False

        try:
            async for event_str in run_revision_pipeline_stream(
                target_prd, structured, effective_feedback, chat_model=chat_model
            ):
                event = json.loads(event_str)

                if event["type"] == "result":
                    result_data = json.loads(event["data"])
                    prd_content = result_data.get("prd_content")

                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            has_error = True
            logger.error("LLM authentication error during revision: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            has_error = True
            logger.error("Unexpected error during revision: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'data': f'修改过程中发生错误: {str(e)}'})}\n\n"
        finally:
            # Persist - runs on success, error, or client disconnect
            if has_error:
                update_project(project_id, status="error")
            elif prd_content:
                new_version = project["version"] + 1
                update_project(
                    project_id,
                    status="reviewing",
                    version=new_version,
                    prd_content=prd_content,
                )
                append_chat_message(project_id, "assistant", prd_content)
                append_version_history(project_id, "revised", feedback)
                save_prd_version(project_id, prd_content, "revised")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class BatchDesignRequest(BaseModel):
    global_style: str = Field(default="", description="Global UI style requirements applied to all pages")


@router.post("/{project_id}/generate-designs")
@rate_limit(generation_limiter)
async def api_generate_designs(
    project_id: str,
    request: Request,
    body: BatchDesignRequest = None,
    current_user: dict = Depends(get_current_user),
):
    """Generate UI design images based on project's PRD and requirement."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    if not project["prd_content"]:
        raise HTTPException(status_code=400, detail="请先生成 PRD 文档")

    chat_model = project.get("chat_model") or None
    image_model = project.get("image_model") or None

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
            logger.warning("Failed to parse pages_plan JSON for project %s", project_id)

    # Filter out archived/deleted pages from batch design generation
    if pages_plan:
        raw_pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
        active_pages = [p for p in raw_pages if p.get("category", "active") == "active"]
        if isinstance(pages_plan, dict):
            pages_plan = {**pages_plan, "pages": active_pages}
        else:
            pages_plan = active_pages

    global_style = ""
    if body and body.global_style:
        global_style = body.global_style

    async def event_stream():
        all_images = []

        try:
            async for event_str in run_design_generation_stream(
                structured, pages_plan, project["prd_content"],
                chat_model=chat_model, image_model=image_model,
                global_style=global_style,
            ):
                event = json.loads(event_str)

                if event["type"] == "image":
                    image_data = json.loads(event["data"])
                    all_images.append(image_data)

                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            logger.error("LLM authentication error during design generation: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            logger.error("Unexpected error during design generation: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': f'设计图生成过程中发生错误: {str(e)}'})}\n\n"
        finally:
            # Persist generated images to DB - runs on success, error, or client disconnect
            if all_images:
                update_project(
                    project_id,
                    design_images=json.dumps(all_images, ensure_ascii=False),
                )
                save_design_version(project_id, all_images, "batch_generated")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{project_id}/generate-design-page")
@rate_limit(generation_limiter)
async def api_generate_single_page_design(
    project_id: str,
    body: SinglePageDesignRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Generate UI design image for a single page."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    if not project["pages_plan"]:
        raise HTTPException(status_code=400, detail="请先生成 PRD 文档")

    image_model = project.get("image_model") or None

    pages_plan = {}
    try:
        pages_plan = json.loads(project["pages_plan"])
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="页面规划数据异常")

    # Normalize pages_plan format (could be a list or dict)
    if isinstance(pages_plan, list):
        pages_plan = {"pages": pages_plan}

    pages = pages_plan.get("pages", [])
    target_page = None
    for p in pages:
        if p.get("id") == body.page_id:
            target_page = p
            break

    if not target_page:
        raise HTTPException(status_code=404, detail="页面不存在")

    structured = {}
    if project["structured_requirement"]:
        try:
            structured = json.loads(project["structured_requirement"])
        except json.JSONDecodeError:
            pass

    product_name = structured.get("productName", "")

    image_resolution = body.image_resolution or ""
    image_ratio = body.image_ratio or ""
    image_extra_requirements = body.image_extra_requirements or ""
    reference_image = body.reference_image or ""

    async def event_stream():
        image_data = None

        try:
            async for event_str in run_single_page_design_stream(
                target_page, product_name=product_name, image_model=image_model,
                image_resolution=image_resolution, image_ratio=image_ratio,
                image_extra_requirements=image_extra_requirements,
                reference_image=reference_image,
            ):
                event = json.loads(event_str)

                if event["type"] == "image":
                    image_data = json.loads(event["data"])

                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            logger.error("LLM authentication error during single page design: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            logger.error("Unexpected error during single page design: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': f'设计图生成过程中发生错误: {str(e)}'})}\n\n"
        finally:
            # Update design_images in DB - runs on success, error, or client disconnect
            if image_data:
                existing = []
                if project["design_images"]:
                    try:
                        existing = json.loads(project["design_images"])
                    except json.JSONDecodeError:
                        existing = []

                # Replace if same page_id exists, otherwise append
                updated = [img for img in existing if img.get("page_id") != image_data["page_id"]]
                updated.append(image_data)
                update_project(
                    project_id,
                    design_images=json.dumps(updated, ensure_ascii=False),
                )
                save_design_version(project_id, updated, "single_page_generated")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Comprehensive Solution AI Integration
# ---------------------------------------------------------------------------

@router.post("/{project_id}/generate-comprehensive")
@rate_limit(generation_limiter)
async def api_generate_comprehensive(
    project_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Generate AI-integrated comprehensive product solution via SSE stream."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    prd_content = project.get("prd_content", "")
    if not prd_content:
        raise HTTPException(status_code=400, detail="PRD 内容为空，请先生成 PRD")

    # Use comprehensive_model if set, otherwise fall back to chat_model
    comprehensive_model = project.get("comprehensive_model", "") or project.get("chat_model", "") or None

    design_images = []
    if project.get("design_images"):
        try:
            design_images = json.loads(project["design_images"])
        except json.JSONDecodeError:
            pass

    pages_plan = None
    if project.get("pages_plan"):
        try:
            pages_plan = json.loads(project["pages_plan"])
        except json.JSONDecodeError:
            pass

    # Filter out archived/deleted pages from comprehensive generation
    active_page_ids = set()
    if pages_plan:
        pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
        active_page_ids = {
            p.get("id", "")
            for p in pages
            if p.get("category", "active") == "active"
        }
        # Build filtered pages_plan with only active pages
        if isinstance(pages_plan, dict):
            pages_plan = {**pages_plan, "pages": [p for p in pages if p.get("category", "active") == "active"]}
        else:
            pages_plan = [p for p in pages_plan if p.get("category", "active") == "active"]

    # Only include design images for active pages
    if active_page_ids:
        design_images = [img for img in design_images if img.get("page_id", "") in active_page_ids]

    async def event_stream():
        comprehensive_content = ""
        try:
            async for event_str in consolidate_comprehensive_stream(
                prd_content=prd_content,
                design_images=design_images,
                pages_plan=pages_plan,
                chat_model=comprehensive_model,
            ):
                event = json.loads(event_str)
                if event["type"] == "comprehensive_complete":
                    comprehensive_content = event["data"]
                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            logger.error("LLM auth error during comprehensive generation: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            logger.error("Error during comprehensive generation: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': f'AI 内容整合失败: {str(e)}'})}\n\n"
        finally:
            if comprehensive_content:
                save_comprehensive_version(project_id, comprehensive_content, "ai_generated")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# AI Auto-fill Page Content
# ---------------------------------------------------------------------------

class AiFillPageContentRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User description for AI to fill page content fields")
    current_fields: dict = Field(default_factory=dict, description="Current form field values")


@router.post("/{project_id}/ai-fill-page-content")
@rate_limit(generation_limiter)
async def api_ai_fill_page_content(
    project_id: str,
    body: AiFillPageContentRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Use LLM to auto-fill page content description fields via SSE stream."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    check_project_permission(project_id, current_user, "edit")

    chat_model = project.get("chat_model") or None

    async def event_stream():
        try:
            async for event_str in ai_fill_page_content_stream(
                message=body.message,
                current_fields=body.current_fields,
                chat_model=chat_model,
            ):
                yield f"data: {event_str}\n\n"
        except (ValueError, OpenAIAuthError) as e:
            logger.error("LLM auth error during AI fill: %s", e)
            error_msg = str(e) if isinstance(e, ValueError) else (
                "OpenRouter API 认证失败，请检查 OPENROUTER_API_KEY 是否正确配置。"
            )
            yield f"data: {json.dumps({'type': 'error', 'data': error_msg})}\n\n"
        except Exception as e:
            logger.error("Error during AI fill: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'data': f'AI 填充失败: {str(e)}'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
