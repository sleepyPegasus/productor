import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.config import settings

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "productor.db")


def get_db_path() -> str:
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            description TEXT DEFAULT '',
            category TEXT DEFAULT 'general',
            system_prompt TEXT DEFAULT '',
            user_prompt_template TEXT DEFAULT '',
            output_format TEXT DEFAULT 'text',
            model_type TEXT DEFAULT 'chat',
            parameters TEXT DEFAULT '{}',
            input_variables TEXT DEFAULT '[]',
            extra_data TEXT DEFAULT '{}',
            is_builtin INTEGER DEFAULT 0,
            is_enabled INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'created',
            version INTEGER DEFAULT 0,
            chat_model TEXT DEFAULT '',
            image_model TEXT DEFAULT '',
            raw_requirement TEXT DEFAULT '',
            structured_requirement TEXT DEFAULT '',
            pages_plan TEXT DEFAULT '',
            prd_content TEXT DEFAULT '',
            design_images TEXT DEFAULT '[]',
            history TEXT DEFAULT '[]',
            chat_history TEXT DEFAULT '[]',
            prd_versions TEXT DEFAULT '[]',
            design_versions TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    # Migrate: add columns if missing
    for col, default in [
        ("design_images", "'[]'"),
        ("chat_model", "''"),
        ("image_model", "''"),
        ("comprehensive_model", "''"),
        ("prd_versions", "'[]'"),
        ("design_versions", "'[]'"),
        ("comprehensive_content", "''"),
        ("comprehensive_versions", "'[]'"),
        ("default_image_resolution", "''"),
        ("default_image_ratio", "''"),
        ("category", "'active'"),
    ]:
        try:
            conn.execute(f"SELECT {col} FROM projects LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT DEFAULT {default}")
            conn.commit()
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_project(
    name: str,
    description: str = "",
    chat_model: str = "",
    image_model: str = "",
    comprehensive_model: str = "",
    default_image_resolution: str = "",
    default_image_ratio: str = "",
) -> dict:
    project_id = uuid.uuid4().hex[:8]
    now = _now()
    conn = get_connection()
    conn.execute(
        """INSERT INTO projects (id, name, description, status, version,
           chat_model, image_model, comprehensive_model,
           default_image_resolution, default_image_ratio, category,
           raw_requirement, structured_requirement, pages_plan, prd_content,
           design_images, history, chat_history, prd_versions, design_versions,
           created_at, updated_at)
           VALUES (?, ?, ?, 'created', 0, ?, ?, ?, ?, ?, 'active', '', '', '', '', '[]', '[]', '[]', '[]', '[]', ?, ?)""",
        (project_id, name, description, chat_model, image_model, comprehensive_model,
         default_image_resolution, default_image_ratio, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row)


def list_projects(
    category: str = "active",
    search: str = "",
) -> list[dict]:
    conn = get_connection()
    conditions = []
    params = []

    if category:
        conditions.append("COALESCE(category, 'active') = ?")
        params.append(category)

    if search:
        conditions.append("(name LIKE ? OR description LIKE ?)")
        like_val = f"%{search}%"
        params.extend([like_val, like_val])

    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)

    query = (
        "SELECT id, name, description, status, version, category, "
        "chat_model, image_model, comprehensive_model, "
        "default_image_resolution, default_image_ratio, "
        "prd_content, design_images, created_at, updated_at "
        f"FROM projects {where} ORDER BY updated_at DESC"
    )
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_project(project_id: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_project(project_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [project_id]
    conn = get_connection()
    conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_project(project_id: str) -> bool:
    """Soft delete: set category to 'deleted'."""
    conn = get_connection()
    cursor = conn.execute(
        "UPDATE projects SET category = 'deleted', updated_at = ? WHERE id = ?",
        (_now(), project_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def archive_project(project_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute(
        "UPDATE projects SET category = 'archived', updated_at = ? WHERE id = ?",
        (_now(), project_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def restore_project(project_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute(
        "UPDATE projects SET category = 'active', updated_at = ? WHERE id = ?",
        (_now(), project_id),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def permanently_delete_project(project_id: str) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def append_chat_message(project_id: str, role: str, content: str):
    project = get_project(project_id)
    if not project:
        return
    chat_history = json.loads(project["chat_history"] or "[]")
    chat_history.append({
        "role": role,
        "content": content,
        "timestamp": _now(),
    })
    update_project(project_id, chat_history=json.dumps(chat_history, ensure_ascii=False))


def get_chat_history(project_id: str) -> list[dict]:
    project = get_project(project_id)
    if not project:
        return []
    return json.loads(project["chat_history"] or "[]")


def update_chat_history(project_id: str, messages: list[dict]):
    """Replace the entire chat history with the provided messages list."""
    update_project(project_id, chat_history=json.dumps(messages, ensure_ascii=False))


def append_version_history(project_id: str, action: str, feedback: str = None):
    project = get_project(project_id)
    if not project:
        return
    history = json.loads(project["history"] or "[]")
    history.append({
        "version": project["version"],
        "action": action,
        "feedback": feedback,
        "timestamp": _now(),
    })
    update_project(project_id, history=json.dumps(history, ensure_ascii=False))


def save_prd_version(project_id: str, content: str, action: str = "manual_edit"):
    """Save current PRD content as a version snapshot."""
    project = get_project(project_id)
    if not project:
        return
    prd_versions = json.loads(project.get("prd_versions") or "[]")
    version_num = len(prd_versions) + 1
    prd_versions.append({
        "version": version_num,
        "content": content,
        "action": action,
        "timestamp": _now(),
    })
    update_project(project_id, prd_versions=json.dumps(prd_versions, ensure_ascii=False))
    return version_num


def get_prd_versions(project_id: str) -> list[dict]:
    """Get all PRD version snapshots (metadata only)."""
    project = get_project(project_id)
    if not project:
        return []
    prd_versions = json.loads(project.get("prd_versions") or "[]")
    return [{
        "version": v["version"],
        "action": v.get("action", ""),
        "timestamp": v["timestamp"],
    } for v in prd_versions]


def get_prd_version_content(project_id: str, version: int) -> Optional[str]:
    """Get PRD content for a specific version."""
    project = get_project(project_id)
    if not project:
        return None
    prd_versions = json.loads(project.get("prd_versions") or "[]")
    for v in prd_versions:
        if v["version"] == version:
            return v["content"]
    return None


def save_design_version(project_id: str, design_images: list, action: str = "generated"):
    """Save current design images as a version snapshot."""
    project = get_project(project_id)
    if not project:
        return
    design_versions = json.loads(project.get("design_versions") or "[]")
    version_num = len(design_versions) + 1
    design_versions.append({
        "version": version_num,
        "images": design_images,
        "action": action,
        "timestamp": _now(),
    })
    update_project(project_id, design_versions=json.dumps(design_versions, ensure_ascii=False))
    return version_num


def get_design_versions(project_id: str) -> list[dict]:
    """Get all design version snapshots metadata."""
    project = get_project(project_id)
    if not project:
        return []
    design_versions = json.loads(project.get("design_versions") or "[]")
    return [{
        "version": v["version"],
        "action": v.get("action", ""),
        "image_count": len(v.get("images", [])),
        "timestamp": v["timestamp"],
    } for v in design_versions]


def get_design_version_images(project_id: str, version: int) -> Optional[list]:
    """Get design images for a specific version."""
    project = get_project(project_id)
    if not project:
        return None
    design_versions = json.loads(project.get("design_versions") or "[]")
    for v in design_versions:
        if v["version"] == version:
            return v.get("images", [])
    return None


# ---------------------------------------------------------------------------
# Comprehensive Solution Versioning
# ---------------------------------------------------------------------------

def save_comprehensive_version(project_id: str, content: str, action: str = "ai_generated") -> Optional[int]:
    """Save comprehensive solution content as a version snapshot."""
    project = get_project(project_id)
    if not project:
        return None
    comp_versions = json.loads(project.get("comprehensive_versions") or "[]")
    version_num = len(comp_versions) + 1
    comp_versions.append({
        "version": version_num,
        "content": content,
        "action": action,
        "timestamp": _now(),
    })
    update_project(
        project_id,
        comprehensive_content=content,
        comprehensive_versions=json.dumps(comp_versions, ensure_ascii=False),
    )
    return version_num


def get_comprehensive_versions(project_id: str) -> list[dict]:
    """Get all comprehensive version snapshots (metadata only)."""
    project = get_project(project_id)
    if not project:
        return []
    comp_versions = json.loads(project.get("comprehensive_versions") or "[]")
    return [{
        "version": v["version"],
        "action": v.get("action", ""),
        "timestamp": v["timestamp"],
    } for v in comp_versions]


def get_comprehensive_version_content(project_id: str, version: int) -> Optional[str]:
    """Get comprehensive solution content for a specific version."""
    project = get_project(project_id)
    if not project:
        return None
    comp_versions = json.loads(project.get("comprehensive_versions") or "[]")
    for v in comp_versions:
        if v["version"] == version:
            return v["content"]
    return None


def update_comprehensive_content(project_id: str, content: str) -> Optional[dict]:
    """Update the current comprehensive content."""
    return update_project(project_id, comprehensive_content=content)


# ---------------------------------------------------------------------------
# Skills CRUD
# ---------------------------------------------------------------------------

def create_skill(
    name: str,
    display_name: str,
    description: str = "",
    category: str = "general",
    system_prompt: str = "",
    user_prompt_template: str = "",
    output_format: str = "text",
    model_type: str = "chat",
    parameters: dict = None,
    input_variables: list = None,
    extra_data: dict = None,
    is_builtin: bool = False,
    is_enabled: bool = True,
) -> dict:
    skill_id = uuid.uuid4().hex[:8]
    now = _now()
    conn = get_connection()
    conn.execute(
        """INSERT INTO skills (id, name, display_name, description, category,
           system_prompt, user_prompt_template, output_format, model_type,
           parameters, input_variables, extra_data,
           is_builtin, is_enabled, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (skill_id, name, display_name, description, category,
         system_prompt, user_prompt_template, output_format, model_type,
         json.dumps(parameters or {}, ensure_ascii=False),
         json.dumps(input_variables or [], ensure_ascii=False),
         json.dumps(extra_data or {}, ensure_ascii=False),
         1 if is_builtin else 0,
         1 if is_enabled else 0,
         now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    conn.close()
    return dict(row)


def list_skills(category: str = None, is_enabled: bool = None) -> list[dict]:
    conn = get_connection()
    conditions = []
    params = []
    if category:
        conditions.append("category = ?")
        params.append(category)
    if is_enabled is not None:
        conditions.append("is_enabled = ?")
        params.append(1 if is_enabled else 0)
    where = ""
    if conditions:
        where = "WHERE " + " AND ".join(conditions)
    rows = conn.execute(
        f"SELECT * FROM skills {where} ORDER BY is_builtin DESC, updated_at DESC",
        params,
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_skill(skill_id: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_skill_by_name(name: str) -> Optional[dict]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM skills WHERE name = ? AND is_enabled = 1", (name,)).fetchone()
    conn.close()
    return dict(row) if row else None


def update_skill(skill_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [skill_id]
    conn = get_connection()
    conn.execute(f"UPDATE skills SET {set_clause} WHERE id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_skill(skill_id: str) -> bool:
    conn = get_connection()
    # Only allow deleting non-builtin skills
    cursor = conn.execute(
        "DELETE FROM skills WHERE id = ? AND is_builtin = 0",
        (skill_id,),
    )
    conn.commit()
    conn.close()
    return cursor.rowcount > 0


def skill_exists(name: str) -> bool:
    conn = get_connection()
    row = conn.execute("SELECT 1 FROM skills WHERE name = ?", (name,)).fetchone()
    conn.close()
    return row is not None
