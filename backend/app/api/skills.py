"""Skill management API routes."""

import json
import logging

from fastapi import APIRouter, HTTPException, Depends

from app.db.database import (
    create_skill,
    delete_skill,
    get_skill,
    list_skills,
    skill_exists,
    update_skill,
)
from app.models.schemas import SkillCreate, SkillUpdate
from app.services.skill_service import reset_skill_to_default
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("")
async def api_list_skills(category: str = None, is_enabled: bool = None, current_user: dict = Depends(get_current_user)):
    """List all skills, optionally filtered by category or enabled status."""
    skills = list_skills(category=category, is_enabled=is_enabled)
    # Convert integer booleans to actual booleans for JSON response
    for s in skills:
        s["is_builtin"] = bool(s.get("is_builtin", 0))
        s["is_enabled"] = bool(s.get("is_enabled", 1))
    return skills


@router.get("/{skill_id}")
async def api_get_skill(skill_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single skill by ID."""
    skill = get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    skill["is_builtin"] = bool(skill.get("is_builtin", 0))
    skill["is_enabled"] = bool(skill.get("is_enabled", 1))
    return skill


@router.post("")
async def api_create_skill(body: SkillCreate, current_user: dict = Depends(get_current_user)):
    """Create a new custom skill."""
    if skill_exists(body.name):
        raise HTTPException(status_code=409, detail=f"技能名称 '{body.name}' 已存在")

    skill = create_skill(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        category=body.category,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        output_format=body.output_format,
        model_type=body.model_type,
        parameters=body.parameters,
        input_variables=body.input_variables,
        extra_data=body.extra_data,
        is_builtin=False,
        is_enabled=True,
    )
    skill["is_builtin"] = bool(skill.get("is_builtin", 0))
    skill["is_enabled"] = bool(skill.get("is_enabled", 1))
    return skill


@router.put("/{skill_id}")
async def api_update_skill(skill_id: str, body: SkillUpdate, current_user: dict = Depends(get_current_user)):
    """Update an existing skill."""
    skill = get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")

    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.description is not None:
        updates["description"] = body.description
    if body.category is not None:
        updates["category"] = body.category
    if body.system_prompt is not None:
        updates["system_prompt"] = body.system_prompt
    if body.user_prompt_template is not None:
        updates["user_prompt_template"] = body.user_prompt_template
    if body.output_format is not None:
        updates["output_format"] = body.output_format
    if body.model_type is not None:
        updates["model_type"] = body.model_type
    if body.parameters is not None:
        updates["parameters"] = json.dumps(body.parameters, ensure_ascii=False)
    if body.input_variables is not None:
        updates["input_variables"] = json.dumps(body.input_variables, ensure_ascii=False)
    if body.extra_data is not None:
        updates["extra_data"] = json.dumps(body.extra_data, ensure_ascii=False)
    if body.is_enabled is not None:
        updates["is_enabled"] = 1 if body.is_enabled else 0

    if updates:
        updates["version"] = skill["version"] + 1

    updated = update_skill(skill_id, **updates)
    if updated:
        updated["is_builtin"] = bool(updated.get("is_builtin", 0))
        updated["is_enabled"] = bool(updated.get("is_enabled", 1))
    return updated


@router.delete("/{skill_id}")
async def api_delete_skill(skill_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a custom skill. Built-in skills cannot be deleted."""
    skill = get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    if skill["is_builtin"]:
        raise HTTPException(status_code=403, detail="内置技能不可删除，可以禁用或重置")

    success = delete_skill(skill_id)
    if not success:
        raise HTTPException(status_code=500, detail="删除失败")
    return {"ok": True}


@router.post("/{skill_id}/reset")
async def api_reset_skill(skill_id: str, current_user: dict = Depends(get_current_user)):
    """Reset a built-in skill to its factory default."""
    skill = get_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="技能不存在")
    if not skill["is_builtin"]:
        raise HTTPException(status_code=400, detail="仅内置技能支持重置")

    result = reset_skill_to_default(skill_id)
    if not result:
        raise HTTPException(status_code=500, detail="重置失败")
    result["is_builtin"] = bool(result.get("is_builtin", 0))
    result["is_enabled"] = bool(result.get("is_enabled", 1))
    return result


@router.post("/{skill_id}/duplicate")
async def api_duplicate_skill(skill_id: str, current_user: dict = Depends(get_current_user)):
    """Duplicate a skill as a new custom skill."""
    source = get_skill(skill_id)
    if not source:
        raise HTTPException(status_code=404, detail="技能不存在")

    # Generate a unique name
    base_name = source["name"] + "_copy"
    new_name = base_name
    counter = 1
    while skill_exists(new_name):
        new_name = f"{base_name}_{counter}"
        counter += 1

    new_skill = create_skill(
        name=new_name,
        display_name=source["display_name"] + " (副本)",
        description=source["description"],
        category=source["category"],
        system_prompt=source["system_prompt"],
        user_prompt_template=source["user_prompt_template"],
        output_format=source["output_format"],
        model_type=source["model_type"],
        parameters=json.loads(source["parameters"] or "{}"),
        input_variables=json.loads(source["input_variables"] or "[]"),
        extra_data=json.loads(source["extra_data"] or "{}"),
        is_builtin=False,
        is_enabled=True,
    )
    new_skill["is_builtin"] = bool(new_skill.get("is_builtin", 0))
    new_skill["is_enabled"] = bool(new_skill.get("is_enabled", 1))
    return new_skill
