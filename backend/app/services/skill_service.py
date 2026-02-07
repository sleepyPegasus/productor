"""Skill management service.

Handles default skill initialization, skill loading for the orchestrator,
and skill reset operations. Inspired by the planning-with-files project's
skill architecture: skills are self-contained entities with metadata +
prompt templates, stored in the database for online editing.
"""

import json
import logging
import os
from typing import Optional

from app.db.database import (
    create_skill,
    get_skill_by_name,
    skill_exists,
    update_skill,
)

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "templates"
)


def _load_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Default built-in skill definitions
# ---------------------------------------------------------------------------

def _get_default_skills() -> list[dict]:
    """Return the list of default built-in skills with their prompts."""
    prompts_dir = os.path.join(TEMPLATES_DIR, "prompts")

    return [
        {
            "name": "requirement_analysis",
            "display_name": "需求分析",
            "description": "将用户的自然语言需求描述转化为结构化的产品需求，包括产品信息、目标用户、功能需求、非功能需求等",
            "category": "analysis",
            "system_prompt": "你是一位资深产品经理和需求分析专家。请严格返回 JSON 格式。",
            "user_prompt_template": _load_file(
                os.path.join(prompts_dir, "requirement_analysis.txt")
            ),
            "output_format": "json",
            "model_type": "chat",
            "parameters": {"temperature": 0.4, "max_tokens": 8192},
            "input_variables": ["requirement"],
            "extra_data": {},
        },
        {
            "name": "prototype_design",
            "display_name": "原型页面设计",
            "description": "根据结构化产品需求规划页面结构，为每个页面生成详细的UI元素和布局描述",
            "category": "design",
            "system_prompt": "你是一位资深 UI/UX 设计师。请严格返回 JSON 格式。",
            "user_prompt_template": _load_file(
                os.path.join(prompts_dir, "prototype_description.txt")
            ),
            "output_format": "json",
            "model_type": "chat",
            "parameters": {"temperature": 0.5, "max_tokens": 8192},
            "input_variables": ["structured_requirement"],
            "extra_data": {},
        },
        {
            "name": "prd_generation",
            "display_name": "PRD文档生成",
            "description": "基于结构化需求和页面规划，生成完整、专业的PRD产品需求文档",
            "category": "document",
            "system_prompt": "你是一位资深产品经理，擅长撰写清晰、完整、专业的 PRD 文档。请直接输出 Markdown 格式的 PRD 文档。",
            "user_prompt_template": _load_file(
                os.path.join(prompts_dir, "prd_generation.txt")
            ),
            "output_format": "markdown",
            "model_type": "chat",
            "parameters": {"temperature": 0.5, "max_tokens": 16384},
            "input_variables": ["structured_requirement", "prd_template"],
            "extra_data": {
                "prd_template": _load_file(
                    os.path.join(TEMPLATES_DIR, "prd_template.md")
                ),
            },
        },
        {
            "name": "feedback_revision",
            "display_name": "反馈修订",
            "description": "根据用户反馈对PRD文档进行精确修订，支持小改、大改和重构三种变更级别",
            "category": "document",
            "system_prompt": "你是一位资深产品经理。请根据反馈修改 PRD 文档，直接输出完整的修改后的 Markdown 文档。",
            "user_prompt_template": _load_file(
                os.path.join(prompts_dir, "feedback_revision.txt")
            ),
            "output_format": "markdown",
            "model_type": "chat",
            "parameters": {"temperature": 0.5, "max_tokens": 16384},
            "input_variables": ["current_prd", "structured_requirement", "feedback"],
            "extra_data": {},
        },
        {
            "name": "comprehensive_solution",
            "display_name": "综合方案生成",
            "description": "将PRD文档和产品界面设计信息整合为一份结构清晰、图文并茂的综合产品方案",
            "category": "document",
            "system_prompt": (
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
            ),
            "user_prompt_template": (
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
            ),
            "output_format": "markdown",
            "model_type": "chat",
            "parameters": {"temperature": 0.5, "max_tokens": 16384},
            "input_variables": ["prd_content", "design_info"],
            "extra_data": {},
        },
    ]


def init_default_skills():
    """Initialize default built-in skills if they don't exist.

    Called during application startup. Only creates skills that don't
    already exist in the database, preserving any user edits.
    """
    defaults = _get_default_skills()
    created = 0
    for skill_def in defaults:
        if not skill_exists(skill_def["name"]):
            create_skill(
                name=skill_def["name"],
                display_name=skill_def["display_name"],
                description=skill_def["description"],
                category=skill_def["category"],
                system_prompt=skill_def["system_prompt"],
                user_prompt_template=skill_def["user_prompt_template"],
                output_format=skill_def["output_format"],
                model_type=skill_def["model_type"],
                parameters=skill_def["parameters"],
                input_variables=skill_def["input_variables"],
                extra_data=skill_def.get("extra_data"),
                is_builtin=True,
                is_enabled=True,
            )
            created += 1
            logger.info("Created default skill: %s", skill_def["name"])
    if created:
        logger.info("Initialized %d default skills", created)


def reset_skill_to_default(skill_id: str) -> Optional[dict]:
    """Reset a built-in skill to its original default prompts and parameters."""
    from app.db.database import get_skill

    skill = get_skill(skill_id)
    if not skill or not skill["is_builtin"]:
        return None

    defaults = _get_default_skills()
    for default in defaults:
        if default["name"] == skill["name"]:
            return update_skill(
                skill_id,
                system_prompt=default["system_prompt"],
                user_prompt_template=default["user_prompt_template"],
                parameters=json.dumps(default["parameters"], ensure_ascii=False),
                input_variables=json.dumps(default["input_variables"], ensure_ascii=False),
                extra_data=json.dumps(default.get("extra_data", {}), ensure_ascii=False),
                description=default["description"],
                version=skill["version"] + 1,
            )
    return None


def load_skill_for_orchestrator(skill_name: str) -> Optional[dict]:
    """Load a skill's configuration for use by the orchestrator.

    Returns a dict with parsed parameters, or None if skill not found/disabled.
    """
    skill = get_skill_by_name(skill_name)
    if not skill:
        return None

    result = dict(skill)
    # Parse JSON fields
    try:
        result["parameters"] = json.loads(skill["parameters"] or "{}")
    except (json.JSONDecodeError, TypeError):
        result["parameters"] = {}
    try:
        result["input_variables"] = json.loads(skill["input_variables"] or "[]")
    except (json.JSONDecodeError, TypeError):
        result["input_variables"] = []
    try:
        result["extra_data"] = json.loads(skill["extra_data"] or "{}")
    except (json.JSONDecodeError, TypeError):
        result["extra_data"] = {}

    result["is_builtin"] = bool(skill["is_builtin"])
    result["is_enabled"] = bool(skill["is_enabled"])
    return result
