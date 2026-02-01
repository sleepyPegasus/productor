"""PRD generation orchestrator using LangChain.

Coordinates the multi-phase pipeline:
  Phase 1: Requirement Analysis
  Phase 2: Prototype Page Planning
  Phase 3: PRD Generation
  Phase 4: Feedback Revision
"""

import json
import os
from collections.abc import AsyncGenerator
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from app.agents.llm import get_chat_llm, get_streaming_llm
from app.config import settings

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

async def analyze_requirement(requirement: str) -> dict:
    """Analyze raw requirement text and return structured JSON."""
    llm = get_chat_llm(temperature=0.4, max_tokens=8192)
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


async def analyze_requirement_stream(requirement: str) -> AsyncGenerator[str, None]:
    """Stream the requirement analysis process, yielding status updates."""
    yield json.dumps({"type": "status", "data": "正在分析需求..."}) + "\n"
    result = await analyze_requirement(requirement)
    yield json.dumps({"type": "requirement", "data": json.dumps(result, ensure_ascii=False)}) + "\n"
    yield json.dumps({"type": "status", "data": "需求分析完成"}) + "\n"


# ---------------------------------------------------------------------------
# Phase 2: Prototype Page Planning
# ---------------------------------------------------------------------------

async def plan_pages(structured_requirement: dict) -> dict:
    """Plan page structure based on structured requirement."""
    llm = get_chat_llm(temperature=0.5, max_tokens=8192)
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
# Phase 3: PRD Generation (streaming)
# ---------------------------------------------------------------------------

async def generate_prd_stream(
    structured_requirement: dict,
    pages_plan: Optional[dict] = None,
) -> AsyncGenerator[str, None]:
    """Stream PRD generation token by token."""
    llm = get_streaming_llm(temperature=0.5, max_tokens=16384)
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
) -> str:
    """Generate complete PRD (non-streaming)."""
    tokens = []
    async for event_str in generate_prd_stream(structured_requirement, pages_plan):
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
) -> AsyncGenerator[str, None]:
    """Stream PRD revision based on user feedback."""
    llm = get_streaming_llm(temperature=0.5, max_tokens=16384)
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
) -> str:
    """Revise PRD based on feedback (non-streaming)."""
    tokens = []
    async for event_str in revise_prd_stream(current_prd, structured_requirement, feedback):
        event = json.loads(event_str)
        if event["type"] == "token":
            tokens.append(event["data"])
    return "".join(tokens)


# ---------------------------------------------------------------------------
# Full pipeline orchestrator
# ---------------------------------------------------------------------------

async def run_full_pipeline_stream(requirement: str) -> AsyncGenerator[str, None]:
    """Run the full PRD generation pipeline with streaming output.

    Yields JSON-line events: status, requirement, token, prd_complete, done
    """
    # Phase 1: Requirement Analysis
    yield json.dumps({"type": "status", "data": "阶段 1/3: 正在分析需求..."}) + "\n"
    structured = await analyze_requirement(requirement)
    yield json.dumps({
        "type": "requirement",
        "data": json.dumps(structured, ensure_ascii=False),
    }) + "\n"

    # Phase 2: Page Planning
    yield json.dumps({"type": "status", "data": "阶段 2/3: 正在规划页面结构..."}) + "\n"
    pages = None
    try:
        pages = await plan_pages(structured)
        yield json.dumps({
            "type": "pages_plan",
            "data": json.dumps(pages, ensure_ascii=False),
        }) + "\n"
    except Exception:
        yield json.dumps({"type": "status", "data": "页面规划跳过（非关键步骤）"}) + "\n"

    # Phase 3: PRD Generation (streamed)
    yield json.dumps({"type": "status", "data": "阶段 3/3: 正在生成 PRD 文档..."}) + "\n"
    prd_tokens = []
    async for event_str in generate_prd_stream(structured, pages):
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
            "prd_content": prd_content,
        }, ensure_ascii=False),
    }) + "\n"


async def run_revision_pipeline_stream(
    current_prd: str,
    structured_requirement: dict,
    feedback: str,
) -> AsyncGenerator[str, None]:
    """Run the revision pipeline with streaming output."""
    yield json.dumps({"type": "status", "data": "正在根据反馈修改 PRD..."}) + "\n"

    prd_tokens = []
    async for event_str in revise_prd_stream(current_prd, structured_requirement, feedback):
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
