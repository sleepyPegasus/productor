"""PRD generation orchestrator using LangChain.

Coordinates the multi-phase pipeline:
  Phase 1: Requirement Analysis
  Phase 2: Prototype Page Planning
  Phase 2.5: UI Image Generation
  Phase 3: PRD Generation
  Phase 4: Feedback Revision

Skills are loaded from the database (managed via the skill management UI).
Falls back to file-based templates if a skill is not found in the database.
"""

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from app.agents.image_generator import generate_image
from app.agents.llm import get_chat_llm, get_streaming_llm
from app.config import settings
from app.services.skill_service import load_skill_for_orchestrator

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


def _load_template(name: str) -> str:
    """Load a prompt template from the filesystem (fallback)."""
    path = os.path.join(TEMPLATES_DIR, "prompts", name)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _load_prd_template() -> str:
    """Load the PRD template from the filesystem (fallback)."""
    path = os.path.join(TEMPLATES_DIR, "prd_template.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _get_skill(skill_name: str) -> Optional[dict]:
    """Load a skill from the database, returning None on failure."""
    try:
        return load_skill_for_orchestrator(skill_name)
    except Exception as e:
        logger.warning("Failed to load skill '%s' from DB: %s", skill_name, e)
        return None


# ---------------------------------------------------------------------------
# Phase 1: Requirement Analysis
# ---------------------------------------------------------------------------

async def analyze_requirement(requirement: str, chat_model: str = None) -> dict:
    """Analyze raw requirement text and return structured JSON."""
    skill = _get_skill("requirement_analysis")
    if skill:
        params = skill["parameters"]
        system_prompt = skill["system_prompt"]
        template_text = skill["user_prompt_template"]
        temperature = params.get("temperature", 0.4)
        max_tokens = params.get("max_tokens", 8192)
    else:
        system_prompt = "你是一位资深产品经理和需求分析专家。请严格返回 JSON 格式。"
        template_text = _load_template("requirement_analysis.txt")
        temperature = 0.4
        max_tokens = 8192

    llm = get_chat_llm(model=chat_model, temperature=temperature, max_tokens=max_tokens)
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
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
    skill = _get_skill("prototype_design")
    if skill:
        params = skill["parameters"]
        system_prompt = skill["system_prompt"]
        template_text = skill["user_prompt_template"]
        temperature = params.get("temperature", 0.5)
        max_tokens = params.get("max_tokens", 8192)
    else:
        system_prompt = "你是一位资深 UI/UX 设计师。请严格返回 JSON 格式。"
        template_text = _load_template("prototype_description.txt")
        temperature = 0.5
        max_tokens = 8192

    llm = get_chat_llm(model=chat_model, temperature=temperature, max_tokens=max_tokens)
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
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
    image_extra_requirements: str = "",
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
    if image_extra_requirements:
        prompt += f"其他要求：{image_extra_requirements}。"
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
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Stream PRD generation token by token."""
    skill = _get_skill("prd_generation")
    if skill:
        params = skill["parameters"]
        system_prompt = skill["system_prompt"]
        template_text = skill["user_prompt_template"]
        prd_template = skill["extra_data"].get("prd_template", _load_prd_template())
        temperature = params.get("temperature", 0.5)
        max_tokens = params.get("max_tokens", 16384)
    else:
        system_prompt = "你是一位资深产品经理，擅长撰写清晰、完整、专业的 PRD 文档。请直接输出 Markdown 格式的 PRD 文档。"
        template_text = _load_template("prd_generation.txt")
        prd_template = _load_prd_template()
        temperature = 0.5
        max_tokens = 16384

    llm = get_streaming_llm(model=chat_model, temperature=temperature, max_tokens=max_tokens)

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", template_text),
    ])
    chain = prompt | llm

    req_str = json.dumps(structured_requirement, ensure_ascii=False, indent=2)
    if pages_plan:
        req_str += "\n\n页面规划信息：\n" + json.dumps(pages_plan, ensure_ascii=False, indent=2)

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
    chat_model: str = None,
) -> str:
    """Generate complete PRD (non-streaming)."""
    tokens = []
    async for event_str in generate_prd_stream(structured_requirement, pages_plan, chat_model=chat_model):
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
    skill = _get_skill("feedback_revision")
    if skill:
        params = skill["parameters"]
        system_prompt = skill["system_prompt"]
        template_text = skill["user_prompt_template"]
        temperature = params.get("temperature", 0.5)
        max_tokens = params.get("max_tokens", 16384)
    else:
        system_prompt = "你是一位资深产品经理。请根据反馈修改 PRD 文档，直接输出完整的修改后的 Markdown 文档。"
        template_text = _load_template("feedback_revision.txt")
        temperature = 0.5
        max_tokens = 16384

    llm = get_streaming_llm(model=chat_model, temperature=temperature, max_tokens=max_tokens)

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
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
# AI Auto-fill Page Content
# ---------------------------------------------------------------------------

_AI_FILL_SYSTEM_PROMPT = """你是一个专业的B端SaaS产品界面设计助手。你的任务是根据用户的描述，帮助填充产品界面页面的结构化描述信息。

你需要输出的字段对应一个专业的B端SaaS界面设计Prompt模板，模板结构如下：

Theme: Professional B-end SaaS web interface for [系统名称/行业], [页面类型].
Layout & Structure:
[导航布局], [顶部区域], [内容区域布局].
Specific Content:
Containing [具体组件描述].
Style & Color:
[风格定义], [配色].
Quality Tags:
[质量标签].

请根据用户的描述，生成或更新以下字段的值。你的回复必须严格按照以下格式：
1. 先用中文简短回复用户的请求（1-3句话，描述你做了什么调整）
2. 然后紧跟一个JSON块（用```json和```包裹），包含所有字段的建议值

JSON字段说明：
- name: 页面名称（简洁的中文名称）
- systemName: 系统名称/行业（如：CRM客户管理系统、电商后台管理平台）
- pageType: 页面类型（如：Dashboard数据看板、列表管理页、详情页、表单页）
- navigationLayout: 导航布局（英文描述，如：Dark left vertical sidebar navigation with collapsible menu groups）
- topArea: 顶部区域（英文描述，如：Top header with breadcrumbs, global search bar, and user profile dropdown）
- contentAreaLayout: 内容区域布局（英文描述，如：Main content area with 3-column layout: filters sidebar, data table, and detail panel）
- specificContent: 具体组件描述（英文描述，如：Complex data tables with sortable columns, status badges, pagination, line charts with date range selector, KPI cards with trend indicators）
- styleDefinition: 风格定义（英文描述，如：Clean corporate style with Ant Design system influence, consistent spacing and typography）
- colorScheme: 配色方案（英文描述，如：White background with corporate blue (#1890ff) accents, light gray (#f5f5f5) secondary background）
- qualityTags: 质量标签（英文，如：High fidelity, vector style, UI/UX, accurate proportions, 8k resolution）

注意：
- 导航布局、顶部区域、内容区域布局、具体组件描述、风格定义、配色方案、质量标签这些字段请用英文填写，因为这些会用于图像生成的Prompt
- 页面名称、系统名称/行业、页面类型用中文填写
- 请确保描述具体、专业、详细，能够生成高质量的B端SaaS界面设计图"""


async def ai_fill_page_content_stream(
    message: str,
    current_fields: dict,
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Stream AI auto-fill for page content fields."""
    llm = get_streaming_llm(model=chat_model, temperature=0.7, max_tokens=4096)

    # Build current fields description
    fields_desc = "\n".join(
        f"- {k}: {v}" for k, v in current_fields.items() if v
    )
    if not fields_desc:
        fields_desc = "（所有字段为空，需要全新填充）"

    user_prompt = f"当前页面字段信息：\n{fields_desc}\n\n用户要求：{message}"

    messages = [
        SystemMessage(content=_AI_FILL_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    full_text = ""
    async for chunk in llm.astream(messages):
        token = chunk.content
        if token:
            full_text += token
            yield json.dumps({"type": "token", "data": token}) + "\n"

    # Parse JSON from the complete response
    json_match = re.search(r"```json\s*([\s\S]*?)```", full_text)
    if json_match:
        try:
            fields = json.loads(json_match.group(1).strip())
            yield json.dumps({"type": "fields", "data": json.dumps(fields, ensure_ascii=False)}) + "\n"
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI fill JSON from response")

    yield json.dumps({"type": "done", "data": ""}) + "\n"


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
    yield json.dumps({"type": "status", "data": "阶段 1/3: 正在分析需求..."}) + "\n"
    structured = await analyze_requirement(requirement, chat_model=chat_model)
    yield json.dumps({
        "type": "requirement",
        "data": json.dumps(structured, ensure_ascii=False),
    }) + "\n"

    # Phase 2: Page Planning
    yield json.dumps({"type": "status", "data": "阶段 2/3: 正在规划页面结构..."}) + "\n"
    pages = None
    try:
        pages = await plan_pages(structured, chat_model=chat_model)
        yield json.dumps({
            "type": "pages_plan",
            "data": json.dumps(pages, ensure_ascii=False),
        }) + "\n"
    except Exception:
        yield json.dumps({"type": "status", "data": "页面规划跳过（非关键步骤）"}) + "\n"

    # Phase 2.5: UI Image Generation skipped – images are managed separately
    # in the Design tab to avoid embedding images in the PRD Markdown.
    page_images = {}

    # Phase 3: PRD Generation (streamed)
    yield json.dumps({"type": "status", "data": "阶段 3/3: 正在生成 PRD 文档..."}) + "\n"
    prd_tokens = []
    async for event_str in generate_prd_stream(structured, pages, chat_model=chat_model):
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
    global_style: str = "",
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
        prompt = _build_image_prompt(page, product_name, image_extra_requirements=global_style)
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
    image_extra_requirements: str = "",
    reference_image: str = "",
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
        image_extra_requirements=image_extra_requirements,
    )
    url = await generate_image(prompt, model=image_model, reference_image=reference_image)

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


# ---------------------------------------------------------------------------
# Phase 5: Comprehensive Solution AI Integration
# ---------------------------------------------------------------------------

_DEFAULT_COMPREHENSIVE_SYSTEM_PROMPT = (
    "你是一位资深产品经理和文档专家。你的任务是将 PRD 文档和产品界面设计信息整合成一份"
    "结构清晰、内容完整、图文并茂的综合产品方案。\n\n"
    "整合要求：\n"
    "1. 保留 PRD 的核心内容，但重新组织结构使其更适合作为产品方案呈现\n"
    "2. 将界面设计描述自然地融入到对应的功能模块中\n"
    "3. 对内容进行提炼和润色，使表述更加专业和简洁\n"
    "4. 确保方案具有完整的逻辑脉络：背景→目标→方案→实现\n"
    "5. 输出 Markdown 格式\n"
    "6. **重要：在每个页面/功能模块的描述后，必须使用 `{{IMAGE:页面ID}}` 标记来插入对应的"
    "界面设计图。** 系统会自动将标记替换为实际的设计图。请确保每个有设计图的页面都包含对应的标记。"
)

_DEFAULT_COMPREHENSIVE_USER_TEMPLATE = (
    "请将以下 PRD 文档和产品界面设计信息整合为一份综合产品方案。\n\n"
    "## PRD 文档内容\n\n{prd_content}\n\n"
    "## 产品界面设计信息\n\n{design_info}\n\n"
    "请输出整合后的综合产品方案（Markdown 格式）。方案应当包含但不限于：\n"
    "- 产品概述与背景\n"
    "- 核心目标与价值\n"
    "- 功能模块详述（结合界面设计说明和设计图）\n"
    "- 信息架构与页面流转\n"
    "- 技术方案概要\n"
    "- 实施路线图与优先级\n\n"
    "**图片插入规则：** 在每个功能模块或页面描述的末尾，使用 `{{IMAGE:页面ID}}` 标记"
    "插入该页面的界面设计图。例如：如果页面ID为 `page_1`，则写 `{{IMAGE:page_1}}`。"
    "请确保所有提供的页面设计图都被引用。\n\n"
    "注意：直接输出方案内容，不要包含额外的解释说明。"
)


def _embed_design_images(content: str, design_images: list) -> str:
    """Replace ``{{IMAGE:page_id}}`` placeholders with actual image markdown.

    Any design images not referenced via placeholders are appended at the end
    so that no image is lost.
    """
    image_map = {img["page_id"]: img for img in design_images if img.get("image_url")}
    used_ids: set[str] = set()

    def _replacer(match: re.Match) -> str:
        page_id = match.group(1).strip()
        if page_id in image_map:
            used_ids.add(page_id)
            img = image_map[page_id]
            page_name = img.get("page_name", "界面设计图")
            return f'\n\n![{page_name} 界面设计图]({img["image_url"]})\n'
        return match.group(0)

    content = re.sub(r'\{\{IMAGE:([^}]+)\}\}', _replacer, content)

    # Append any unreferenced images at the end
    unreferenced = [img for pid, img in image_map.items() if pid not in used_ids]
    if unreferenced:
        content += "\n\n---\n\n## 界面设计图\n"
        for img in unreferenced:
            page_name = img.get("page_name", "界面设计图")
            content += f'\n### {page_name}\n\n![{page_name} 界面设计图]({img["image_url"]})\n'

    return content


from app.models.constants import MULTIMODAL_PATTERNS


def _is_model_multimodal(model_id: str) -> bool:
    """Heuristic check whether a model supports image input."""
    if not model_id:
        return False
    model_lower = model_id.lower()
    return any(p in model_lower for p in MULTIMODAL_PATTERNS)


async def consolidate_comprehensive_stream(
    prd_content: str,
    design_images: list,
    pages_plan: Optional[dict],
    chat_model: str = None,
) -> AsyncGenerator[str, None]:
    """Use LLM to consolidate PRD and design info into an integrated solution.

    Yields JSON-line events: status, token, comprehensive_complete, done, error.

    For multimodal models (e.g. kimi-k2.5, gpt-4o), design images are sent as
    image content parts so the model can *see* the designs.  All models receive
    ``{{IMAGE:page_id}}`` placeholder instructions; after generation the
    placeholders are replaced with actual ``![…](url)`` markdown.
    """
    if not settings.OPENROUTER_API_KEY:
        yield json.dumps({
            "type": "error",
            "data": "未配置 OpenRouter API Key（OPENROUTER_API_KEY），无法进行 AI 内容整合",
        }) + "\n"
        return

    yield json.dumps({"type": "status", "data": "正在通过 AI 整合综合产品方案..."}) + "\n"

    # Load skill from database
    skill = _get_skill("comprehensive_solution")
    if skill:
        params = skill["parameters"]
        comp_system_prompt = skill["system_prompt"]
        comp_user_template = skill["user_prompt_template"]
        temperature = params.get("temperature", 0.5)
        max_tokens = params.get("max_tokens", 16384)
    else:
        comp_system_prompt = _DEFAULT_COMPREHENSIVE_SYSTEM_PROMPT
        comp_user_template = _DEFAULT_COMPREHENSIVE_USER_TEMPLATE
        temperature = 0.5
        max_tokens = 16384

    # Build design info text
    design_info_parts = []
    page_info = {}
    if pages_plan:
        pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
        for p in pages:
            page_info[p.get("id", "")] = p

    for img_data in design_images:
        page_name = img_data.get("page_name", "页面")
        page_id = img_data.get("page_id", "")
        info = page_info.get(page_id, {})
        part = f"### {page_name}（页面ID: {page_id}）\n"
        if info.get("description"):
            part += f"- 页面描述：{info['description']}\n"
        if info.get("keyElements"):
            part += f"- 关键元素：{', '.join(info['keyElements'])}\n"
        if info.get("layoutDescription"):
            part += f"- 布局说明：{info['layoutDescription']}\n"
        if img_data.get("image_url"):
            part += f"- 已生成界面设计图（请在对应功能模块描述后使用 `{{{{IMAGE:{page_id}}}}}` 插入）\n"
        else:
            part += "- 未生成界面设计图\n"
        design_info_parts.append(part)

    design_info = "\n".join(design_info_parts) if design_info_parts else "暂无界面设计信息。"

    user_text = comp_user_template.format(
        prd_content=prd_content,
        design_info=design_info,
    )

    # Build LLM messages – use multimodal content for capable models
    is_multimodal = _is_model_multimodal(chat_model or "")
    image_parts_for_multimodal = []

    if is_multimodal and design_images:
        for img_data in design_images:
            url = img_data.get("image_url", "")
            if not url:
                continue
            page_name = img_data.get("page_name", "页面")
            image_parts_for_multimodal.append({
                "type": "text",
                "text": f"[{page_name} 的界面设计图]:",
            })
            image_parts_for_multimodal.append({
                "type": "image_url",
                "image_url": {"url": url},
            })

    if image_parts_for_multimodal:
        # Multimodal: text + images in a single HumanMessage
        human_content = [{"type": "text", "text": user_text}] + image_parts_for_multimodal
    else:
        human_content = user_text

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            llm = get_streaming_llm(model=chat_model, temperature=temperature, max_tokens=max_tokens)
            messages = [
                SystemMessage(content=comp_system_prompt),
                HumanMessage(content=human_content),
            ]

            tokens = []
            async for chunk in llm.astream(messages):
                token = chunk.content
                if token:
                    tokens.append(token)
                    yield json.dumps({"type": "token", "data": token}) + "\n"

            full_content = "".join(tokens)

            # Post-process: replace {{IMAGE:page_id}} with actual image markdown
            if design_images:
                full_content = _embed_design_images(full_content, design_images)

            yield json.dumps({"type": "comprehensive_complete", "data": full_content}) + "\n"
            yield json.dumps({"type": "done", "data": "综合产品方案整合完成"}) + "\n"
            return  # Success

        except Exception as e:
            is_retryable = (
                "network" in str(e).lower()
                or "connection" in str(e).lower()
                or "timeout" in str(e).lower()
            )

            if is_retryable and attempt < max_retries:
                wait_time = 2 ** (attempt + 1)  # 2s, 4s
                logger.warning(
                    "Comprehensive consolidation attempt %d/%d failed (%s), retrying in %ds...",
                    attempt + 1, max_retries + 1, str(e), wait_time,
                )
                yield json.dumps({
                    "type": "status",
                    "data": f"网络连接中断，{wait_time}秒后重试（第{attempt + 1}次）...",
                }) + "\n"
                yield json.dumps({"type": "comprehensive_reset"}) + "\n"
                await asyncio.sleep(wait_time)
                continue

            logger.exception("Comprehensive consolidation failed")
            yield json.dumps({
                "type": "error",
                "data": f"AI 内容整合失败: {str(e)}",
            }) + "\n"
            return
