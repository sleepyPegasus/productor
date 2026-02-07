"""PRD generation orchestrator using LangChain.

Coordinates the multi-phase pipeline:
  Phase 1: Requirement Analysis
  Phase 2: Prototype Page Planning
  Phase 2.5: UI Image Generation
  Phase 3: PRD Generation
  Phase 4: Feedback Revision
"""

import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from app.agents.image_generator import generate_image
from app.agents.llm import get_chat_llm, get_streaming_llm
from app.config import settings

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


def _load_template(name: str) -> str:
    path = os.path.join(TEMPLATES_DIR, "prompts", name)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_prd_template() -> str:
    path = os.path.join(TEMPLATES_DIR, "prd_template.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Phase 1: Requirement Analysis
# ---------------------------------------------------------------------------

async def analyze_requirement(requirement: str, chat_model: str = None) -> dict:
    """Analyze raw requirement text and return structured JSON."""
    llm = get_chat_llm(model=chat_model, temperature=0.4, max_tokens=8192)
    template_text = _load_template("requirement_analysis.txt")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一位资深产品经理和需求分析专家。请严格返回 JSON 格式。"),
        ("human", template_text),
    ])
    chain = prompt | llm
    response = await chain.ainvoke({"requirement": requirement})
    content = response.content.strip()
    # Strip markdown code fences if present
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines)
    return json.loads(content)


async def analyze_requirement_stream(requirement: str, chat_model: str = None) -> AsyncGenerator[str, None]:
    """Stream the requirement analysis process, yielding status updates."""
    yield json.dumps({"type": "status", "data": "正在分析需求..."}) + "\n"
    result = await analyze_requirement(requirement, chat_model=chat_model)
    yield json.dumps({"type": "requirement", "data": json.dumps(result, ensure_ascii=False)}) + "\n"
    yield json.dumps({"type": "status", "data": "需求分析完成"}) + "\n"


# ---------------------------------------------------------------------------
# Phase 2: Prototype Page Planning
# ---------------------------------------------------------------------------

async def plan_pages(structured_requirement: dict, chat_model: str = None) -> dict:
    """Plan page structure based on structured requirement."""
    llm = get_chat_llm(model=chat_model, temperature=0.5, max_tokens=8192)
    template_text = _load_template("prototype_description.txt")
    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一位资深 UI/UX 设计师。请严格返回 JSON 格式。"),
        ("human", template_text),
    ])
    chain = prompt | llm
    response = await chain.ainvoke({
        "structured_requirement": json.dumps(structured_requirement, ensure_ascii=False, indent=2)
    })
    content = response.content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        content = "\n".join(lines)
    return json.loads(content)


# ---------------------------------------------------------------------------
# Phase 2.5: UI Image Generation
# ---------------------------------------------------------------------------

def _normalize_pages_plan(pages_plan) -> dict:
    """Normalize pages_plan to always be a dict with a 'pages' list."""
    if isinstance(pages_plan, list):
        return {"pages": pages_plan}
    if isinstance(pages_plan, dict):
        if "pages" not in pages_plan:
            # The dict itself might be a single page or have a different structure
            # Try to find any list value that looks like pages
            for v in pages_plan.values():
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    return {"pages": v}
        return pages_plan
    return {"pages": []}


def _build_image_prompt(
    page: dict,
    product_name: str = "",
    image_resolution: str = "",
    image_ratio: str = "",
) -> str:
    """Build an image generation prompt from a page plan entry."""
    name = page.get("name", "页面")
    desc = page.get("description", "")
    elements = ", ".join(page.get("keyElements", []))
    layout = page.get("layoutDescription", "")

    prompt = (
        f"专业的产品UI界面设计图，{product_name} - {name}页面。"
        f"页面描述：{desc}。"
    )
    if layout:
        prompt += f"布局：{layout}。"
    if elements:
        prompt += f"包含以下UI元素：{elements}。"
    if image_resolution:
        prompt += f"目标分辨率：{image_resolution}。"
    if image_ratio:
        prompt += f"画面比例：{image_ratio}。"
    prompt += "现代简洁风格，高保真原型图，白色背景，清晰的UI组件和排版。"
    return prompt


async def generate_page_images(
    pages_plan: dict,
    product_name: str = "",
    image_model: str = None,
) -> dict[str, str]:
    """Generate UI images for each page in the plan.

    Returns a dict mapping page_id -> image_url.
    """
    normalized = _normalize_pages_plan(pages_plan)
    pages = normalized.get("pages", [])
    if not pages:
        return {}

    # Generate images concurrently (max 4 at a time)
    semaphore = asyncio.Semaphore(4)
    results = {}

    async def gen_one(page):
        page_id = page.get("id", "")
        prompt = _build_image_prompt(page, product_name)
        async with semaphore:
            url = await generate_image(prompt, model=image_model)
        if url:
            results[page_id] = url

    await asyncio.gather(*(gen_one(p) for p in pages))
    return results


# ---------------------------------------------------------------------------
# Phase 3: PRD Generation (streaming)
# ---------------------------------------------------------------------------

async def generate_prd_stream(
    structured_requirement: dict,
    pages_plan: Optional[dict] = None,
    page_images: Optional[dict[str, str]] = None,
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Stream PRD generation token by token."""
    llm = get_streaming_llm(model=chat_model, temperature=0.5, max_tokens=16384)
    template_text = _load_template("prd_generation.txt")
    prd_template = _load_prd_template()

    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一位资深产品经理，擅长撰写清晰、完整、专业的 PRD 文档。请直接输出 Markdown 格式的 PRD 文档。"),
        ("human", template_text),
    ])
    chain = prompt | llm

    req_str = json.dumps(structured_requirement, ensure_ascii=False, indent=2)
    if pages_plan:
        req_str += "\n\n页面规划信息：\n" + json.dumps(pages_plan, ensure_ascii=False, indent=2)

    # Append image URLs info so the LLM can embed them in the PRD
    if page_images:
        image_info = "\n\n已生成的页面原型图（请在原型设计章节使用 Markdown 图片语法引用）：\n"
        pages = pages_plan.get("pages", []) if pages_plan else []
        page_name_map = {p.get("id", ""): p.get("name", "") for p in pages}
        for page_id, url in page_images.items():
            page_name = page_name_map.get(page_id, page_id)
            image_info += f'- {page_name}: ![{page_name}]({url})\n'
        req_str += image_info

    async for chunk in chain.astream({
        "structured_requirement": req_str,
        "prd_template": prd_template,
    }):
        token = chunk.content
        if token:
            yield json.dumps({"type": "token", "data": token}) + "\n"


async def generate_prd(
    structured_requirement: dict,
    pages_plan: Optional[dict] = None,
    page_images: Optional[dict[str, str]] = None,
    chat_model: str = None,
) -> str:
    """Generate complete PRD (non-streaming)."""
    tokens = []
    async for event_str in generate_prd_stream(structured_requirement, pages_plan, page_images, chat_model=chat_model):
        event = json.loads(event_str)
        if event["type"] == "token":
            tokens.append(event["data"])
    return "".join(tokens)


# ---------------------------------------------------------------------------
# Phase 4: Feedback Revision (streaming)
# ---------------------------------------------------------------------------

async def revise_prd_stream(
    current_prd: str,
    structured_requirement: dict,
    feedback: str,
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Stream PRD revision based on user feedback."""
    llm = get_streaming_llm(model=chat_model, temperature=0.5, max_tokens=16384)
    template_text = _load_template("feedback_revision.txt")

    prompt = ChatPromptTemplate.from_messages([
        ("system", "你是一位资深产品经理。请根据反馈修改 PRD 文档，直接输出完整的修改后的 Markdown 文档。"),
        ("human", template_text),
    ])
    chain = prompt | llm

    async for chunk in chain.astream({
        "current_prd": current_prd,
        "structured_requirement": json.dumps(structured_requirement, ensure_ascii=False, indent=2),
        "feedback": feedback,
    }):
        token = chunk.content
        if token:
            yield json.dumps({"type": "token", "data": token}) + "\n"


async def revise_prd(
    current_prd: str,
    structured_requirement: dict,
    feedback: str,
    chat_model: str = None,
) -> str:
    """Revise PRD based on feedback (non-streaming)."""
    tokens = []
    async for event_str in revise_prd_stream(current_prd, structured_requirement, feedback, chat_model=chat_model):
        event = json.loads(event_str)
        if event["type"] == "token":
            tokens.append(event["data"])
    return "".join(tokens)


# ---------------------------------------------------------------------------
# Full pipeline orchestrator
# ---------------------------------------------------------------------------

async def run_full_pipeline_stream(
    requirement: str,
    chat_model: str = None,
    image_model: str = None,
) -> AsyncGenerator[str, None]:
    """Run the full PRD generation pipeline with streaming output.

    Yields JSON-line events: status, requirement, images, token, prd_complete, done
    """
    # Phase 1: Requirement Analysis
    yield json.dumps({"type": "status", "data": "阶段 1/4: 正在分析需求..."}) + "\n"
    structured = await analyze_requirement(requirement, chat_model=chat_model)
    yield json.dumps({
        "type": "requirement",
        "data": json.dumps(structured, ensure_ascii=False),
    }) + "\n"

    # Phase 2: Page Planning
    yield json.dumps({"type": "status", "data": "阶段 2/4: 正在规划页面结构..."}) + "\n"
    pages = None
    try:
        pages = await plan_pages(structured, chat_model=chat_model)
        yield json.dumps({
            "type": "pages_plan",
            "data": json.dumps(pages, ensure_ascii=False),
        }) + "\n"
    except Exception:
        yield json.dumps({"type": "status", "data": "页面规划跳过（非关键步骤）"}) + "\n"

    # Phase 2.5: UI Image Generation
    page_images = {}
    if pages and settings.OPENROUTER_API_KEY:
        yield json.dumps({"type": "status", "data": "阶段 3/4: 正在生成页面原型图..."}) + "\n"
        product_name = structured.get("productName", "")
        try:
            page_images = await generate_page_images(pages, product_name, image_model=image_model)
            if page_images:
                yield json.dumps({
                    "type": "images",
                    "data": json.dumps(page_images, ensure_ascii=False),
                }) + "\n"
                yield json.dumps({
                    "type": "status",
                    "data": f"已生成 {len(page_images)} 张页面原型图",
                }) + "\n"
        except Exception:
            yield json.dumps({"type": "status", "data": "原型图生成跳过（非关键步骤）"}) + "\n"
    else:
        yield json.dumps({"type": "status", "data": "阶段 3/4: 跳过原型图生成（未配置 API）"}) + "\n"

    # Phase 3: PRD Generation (streamed)
    yield json.dumps({"type": "status", "data": "阶段 4/4: 正在生成 PRD 文档..."}) + "\n"
    prd_tokens = []
    async for event_str in generate_prd_stream(structured, pages, page_images or None, chat_model=chat_model):
        yield event_str
        event = json.loads(event_str)
        if event["type"] == "token":
            prd_tokens.append(event["data"])

    prd_content = "".join(prd_tokens)
    yield json.dumps({"type": "prd_complete", "data": prd_content}) + "\n"
    yield json.dumps({"type": "done", "data": "PRD 生成完成"}) + "\n"

    # Return structured data via a special final event
    yield json.dumps({
        "type": "result",
        "data": json.dumps({
            "structured_requirement": structured,
            "pages_plan": pages,
            "page_images": page_images,
            "prd_content": prd_content,
        }, ensure_ascii=False),
    }) + "\n"


async def run_design_generation_stream(
    structured_requirement: dict,
    pages_plan: Optional[dict],
    prd_content: str,
    chat_model: str = None,
    image_model: str = None,
) -> AsyncGenerator[str, None]:
    """Generate UI design images as a standalone step.

    If no pages_plan exists, re-generate it from the structured requirement.
    Then generate images for each page, yielding progress events.

    Yields JSON-line events: status, image, done, error
    """
    product_name = structured_requirement.get("productName", "")

    # Step 1: Ensure pages_plan exists and is properly formatted
    if pages_plan:
        pages_plan = _normalize_pages_plan(pages_plan)

    if not pages_plan or not pages_plan.get("pages"):
        yield json.dumps({"type": "status", "data": "正在分析页面结构..."}) + "\n"
        try:
            raw_plan = await plan_pages(structured_requirement, chat_model=chat_model)
            pages_plan = _normalize_pages_plan(raw_plan)
        except Exception as e:
            logger.error("Page planning failed: %s", e)
            yield json.dumps({"type": "error", "data": f"页面结构分析失败: {str(e)}"}) + "\n"
            return

    pages = pages_plan.get("pages", [])
    if not pages:
        yield json.dumps({"type": "error", "data": "未找到可生成的页面"}) + "\n"
        return

    total = len(pages)
    yield json.dumps({
        "type": "status",
        "data": f"共 {total} 个页面，开始生成界面设计图...",
    }) + "\n"

    # Step 2: Generate images concurrently (max 4 at a time)
    if not settings.OPENROUTER_API_KEY:
        yield json.dumps({
            "type": "error",
            "data": "未配置 OpenRouter API Key（OPENROUTER_API_KEY），无法生成界面设计图",
        }) + "\n"
        return

    semaphore = asyncio.Semaphore(4)
    results = {}
    errors = []

    async def gen_one(page, idx):
        page_id = page.get("id", f"page_{idx}")
        page_name = page.get("name", f"页面{idx + 1}")
        prompt = _build_image_prompt(page, product_name)
        try:
            async with semaphore:
                url = await generate_image(prompt, model=image_model)
            if url:
                results[page_id] = {
                    "page_id": page_id,
                    "page_name": page_name,
                    "image_url": url,
                    "prompt": prompt,
                }
            else:
                errors.append(page_name)
        except Exception as e:
            logger.error("Failed to generate image for page '%s': %s", page_name, e)
            errors.append(page_name)

    await asyncio.gather(*(gen_one(p, i) for i, p in enumerate(pages)))

    # Yield results one by one in page order
    for i, page in enumerate(pages):
        page_id = page.get("id", f"page_{i}")
        if page_id in results:
            yield json.dumps({
                "type": "image",
                "data": json.dumps(results[page_id], ensure_ascii=False),
            }) + "\n"

    generated_count = len(results)

    if generated_count == 0:
        yield json.dumps({
            "type": "error",
            "data": "界面设计图生成失败，请检查图片模型配置和 API Key 是否正确",
        }) + "\n"
        return

    yield json.dumps({
        "type": "status",
        "data": f"界面设计图生成完成，共 {generated_count}/{total} 张",
    }) + "\n"
    yield json.dumps({"type": "done", "data": f"已生成 {generated_count} 张界面设计图"}) + "\n"


async def run_single_page_design_stream(
    page: dict,
    product_name: str = "",
    image_model: str = None,
    image_resolution: str = "",
    image_ratio: str = "",
) -> AsyncGenerator[str, None]:
    """Generate a design image for a single page.

    Yields JSON-line events: status, image, done, error
    """
    if not settings.OPENROUTER_API_KEY:
        yield json.dumps({
            "type": "error",
            "data": "未配置 OpenRouter API Key（OPENROUTER_API_KEY），无法生成界面设计图",
        }) + "\n"
        return

    page_id = page.get("id", "page_0")
    page_name = page.get("name", "页面")

    yield json.dumps({
        "type": "status",
        "data": f"正在生成「{page_name}」的界面设计图...",
    }) + "\n"

    prompt = _build_image_prompt(
        page, product_name,
        image_resolution=image_resolution, image_ratio=image_ratio,
    )
    url = await generate_image(prompt, model=image_model)

    if url:
        image_data = {
            "page_id": page_id,
            "page_name": page_name,
            "image_url": url,
            "prompt": prompt,
        }
        yield json.dumps({
            "type": "image",
            "data": json.dumps(image_data, ensure_ascii=False),
        }) + "\n"
        yield json.dumps({
            "type": "done",
            "data": f"「{page_name}」界面设计图生成完成",
        }) + "\n"
    else:
        yield json.dumps({
            "type": "error",
            "data": f"「{page_name}」界面设计图生成失败",
        }) + "\n"


async def run_revision_pipeline_stream(
    current_prd: str,
    structured_requirement: dict,
    feedback: str,
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Run the revision pipeline with streaming output."""
    yield json.dumps({"type": "status", "data": "正在根据反馈修改 PRD..."}) + "\n"

    prd_tokens = []
    async for event_str in revise_prd_stream(current_prd, structured_requirement, feedback, chat_model=chat_model):
        yield event_str
        event = json.loads(event_str)
        if event["type"] == "token":
            prd_tokens.append(event["data"])

    prd_content = "".join(prd_tokens)
    yield json.dumps({"type": "prd_complete", "data": prd_content}) + "\n"
    yield json.dumps({"type": "done", "data": "PRD 修改完成"}) + "\n"

    yield json.dumps({
        "type": "result",
        "data": json.dumps({
            "prd_content": prd_content,
        }, ensure_ascii=False),
    }) + "\n"
