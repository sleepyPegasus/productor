"""Async database module using aiosqlite.

This module provides async versions of database operations for use in FastAPI
async endpoints. It runs alongside the synchronous database.py for backward
compatibility.

Usage:
    from app.db.database_async import get_project_async, update_project_async
    
    project = await get_project_async(project_id)
    await update_project_async(project_id, name="New Name")
"""

import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, AsyncGenerator

import aiosqlite
from passlib.hash import bcrypt

from app.config import settings

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "productor.db")


async def get_db_path() -> str:
    return DB_PATH


@asynccontextmanager
async def get_connection() -> AsyncGenerator[aiosqlite.Connection, None]:
    """Async context manager for database connections."""
    conn = await aiosqlite.connect(DB_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        await conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# User CRUD (Async)
# ---------------------------------------------------------------------------

async def get_user_by_id_async(user_id: str) -> Optional[dict]:
    async with get_connection() as conn:
        async with conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return _user_dict(row) if row else None


async def get_user_by_username_async(username: str) -> Optional[dict]:
    async with get_connection() as conn:
        async with conn.execute("SELECT * FROM users WHERE username = ?", (username,)) as cursor:
            row = await cursor.fetchone()
            return _user_dict(row) if row else None


async def verify_user_password_async(username: str, password: str) -> Optional[dict]:
    async with get_connection() as conn:
        async with conn.execute("SELECT * FROM users WHERE username = ?", (username,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            if not bcrypt.verify(password, row["password_hash"]):
                return None
            return _user_dict(row)


async def create_user_async(username: str, email: str, password: str, is_admin: bool = False) -> dict:
    user_id = uuid.uuid4().hex[:8]
    now = _now()
    password_hash = bcrypt.hash(password)
    
    async with get_connection() as conn:
        await conn.execute(
            """INSERT INTO users (id, username, email, password_hash, is_admin, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
            (user_id, username, email, password_hash, 1 if is_admin else 0, now, now),
        )
        await conn.commit()
        
        async with conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return _user_dict(row)


async def update_user_async(user_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [user_id]
    
    async with get_connection() as conn:
        await conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        await conn.commit()
        
        async with conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return _user_dict(row) if row else None


async def list_users_async() -> list[dict]:
    async with get_connection() as conn:
        async with conn.execute("SELECT * FROM users ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
            return [_user_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Project CRUD (Async)
# ---------------------------------------------------------------------------

async def get_project_async(project_id: str) -> Optional[dict]:
    async with get_connection() as conn:
        async with conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def create_project_async(
    name: str,
    description: str = "",
    chat_model: str = "",
    image_model: str = "",
    comprehensive_model: str = "",
    default_image_resolution: str = "",
    default_image_ratio: str = "",
    owner_id: str = "",
) -> dict:
    project_id = uuid.uuid4().hex[:8]
    now = _now()
    
    async with get_connection() as conn:
        await conn.execute(
            """INSERT INTO projects (id, name, description, status, version,
               chat_model, image_model, comprehensive_model,
               default_image_resolution, default_image_ratio, category, owner_id,
               raw_requirement, structured_requirement, pages_plan, prd_content,
               design_images, history, chat_history, prd_versions, design_versions,
               created_at, updated_at)
               VALUES (?, ?, ?, 'created', 0, ?, ?, ?, ?, ?, 'active', ?, '', '', '', '', '[]', '[]', '[]', '[]', '[]', ?, ?)""",
            (project_id, name, description, chat_model, image_model, comprehensive_model,
             default_image_resolution, default_image_ratio, owner_id, now, now),
        )
        await conn.commit()
        
        async with conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row)


async def update_project_async(project_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [project_id]
    
    async with get_connection() as conn:
        await conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
        await conn.commit()
        
        async with conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def list_projects_for_user_async(
    user_id: str,
    category: str = "active",
    search: str = "",
) -> list[dict]:
    conditions = ["COALESCE(p.category, 'active') = ?"]
    params = [category]

    if search:
        conditions.append("(p.name LIKE ? OR p.description LIKE ?)")
        like_val = f"%{search}%"
        params.extend([like_val, like_val])

    where = "WHERE " + " AND ".join(conditions)

    query = f"""
        SELECT DISTINCT p.id, p.name, p.description, p.status, p.version, p.category,
               p.chat_model, p.image_model, p.comprehensive_model,
               p.default_image_resolution, p.default_image_ratio,
               p.prd_content, p.design_images, p.owner_id, p.created_at, p.updated_at
        FROM projects p
        LEFT JOIN project_permissions pp ON p.id = pp.project_id
        {where} AND (p.owner_id = ? OR pp.user_id = ?)
        ORDER BY p.updated_at DESC
    """
    params.extend([user_id, user_id])
    
    async with get_connection() as conn:
        async with conn.execute(query, params) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def delete_project_async(project_id: str) -> bool:
    """Soft delete: set category to 'deleted'."""
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET category = 'deleted', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def archive_project_async(project_id: str) -> bool:
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET category = 'archived', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def restore_project_async(project_id: str) -> bool:
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET category = 'active', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        await conn.commit()
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Chat History (Async)
# ---------------------------------------------------------------------------

async def get_chat_history_async(project_id: str) -> list[dict]:
    async with get_connection() as conn:
        async with conn.execute(
            "SELECT chat_history FROM projects WHERE id = ?", (project_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["chat_history"]:
                try:
                    return json.loads(row["chat_history"])
                except json.JSONDecodeError:
                    return []
            return []


async def update_chat_history_async(project_id: str, messages: list[dict]) -> bool:
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET chat_history = ?, updated_at = ? WHERE id = ?",
            (json.dumps(messages, ensure_ascii=False), _now(), project_id),
        )
        await conn.commit()
        return cursor.rowcount > 0


async def append_chat_message_async(project_id: str, role: str, content: str) -> bool:
    messages = await get_chat_history_async(project_id)
    messages.append({
        "role": role,
        "content": content,
        "timestamp": _now(),
    })
    return await update_chat_history_async(project_id, messages)


# ---------------------------------------------------------------------------
# Version History (Async)
# ---------------------------------------------------------------------------

async def get_prd_versions_async(project_id: str) -> list[dict]:
    async with get_connection() as conn:
        async with conn.execute(
            "SELECT prd_versions FROM projects WHERE id = ?", (project_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row["prd_versions"]:
                try:
                    return json.loads(row["prd_versions"])
                except json.JSONDecodeError:
                    return []
            return []


async def save_prd_version_async(project_id: str, content: str) -> bool:
    versions = await get_prd_versions_async(project_id)
    new_version = (versions[-1]["version"] + 1) if versions else 1
    versions.append({
        "version": new_version,
        "created_at": _now(),
        "preview": content[:200] + "..." if len(content) > 200 else content,
    })
    
    async with get_connection() as conn:
        cursor = await conn.execute(
            "UPDATE projects SET prd_versions = ?, version = ?, updated_at = ? WHERE id = ?",
            (json.dumps(versions, ensure_ascii=False), new_version, _now(), project_id),
        )
        await conn.commit()
        return cursor.rowcount > 0


# ---------------------------------------------------------------------------
# Project Permissions (Async)
# ---------------------------------------------------------------------------

async def get_project_permissions_async(project_id: str) -> list[dict]:
    async with get_connection() as conn:
        async with conn.execute(
            """SELECT pp.*, u.username, u.email
               FROM project_permissions pp
               JOIN users u ON pp.user_id = u.id
               WHERE pp.project_id = ?
               ORDER BY pp.created_at""",
            (project_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_user_permission_for_project_async(project_id: str, user_id: str) -> Optional[str]:
    """Return permission level for a user on a project: 'owner', 'edit', 'view', or None."""
    project = await get_project_async(project_id)
    if not project:
        return None
    if project.get("owner_id") == user_id:
        return "owner"
    
    async with get_connection() as conn:
        async with conn.execute(
            "SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?",
            (project_id, user_id),
        ) as cursor:
            row = await cursor.fetchone()
            return row["permission"] if row else None


# ---------------------------------------------------------------------------
# Skills (Async)
# ---------------------------------------------------------------------------

async def get_skill_by_name_async(name: str) -> Optional[dict]:
    async with get_connection() as conn:
        async with conn.execute(
            "SELECT * FROM skills WHERE name = ? AND is_enabled = 1", (name,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def list_skills_async() -> list[dict]:
    async with get_connection() as conn:
        async with conn.execute(
            "SELECT * FROM skills ORDER BY category, display_name"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_dict(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    d.pop("password_hash", None)
    return d
