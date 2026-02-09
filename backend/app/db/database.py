import json
import logging
import os
import random
import sqlite3
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from passlib.hash import bcrypt

from app.config import settings

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "productor.db")


def get_db_path() -> str:
    return DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
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

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verification_codes (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT DEFAULT 'register',
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_permissions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            permission TEXT NOT NULL DEFAULT 'view',
            granted_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(project_id, user_id)
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
        ("owner_id", "''"),
    ]:
        try:
            conn.execute(f"SELECT {col} FROM projects LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT DEFAULT {default}")
            conn.commit()
    conn.close()


def init_admin_user():
    """Create the default admin user if it doesn't exist."""
    conn = get_connection()
    row = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if not row:
        user_id = uuid.uuid4().hex[:8]
        now = _now()
        password_hash = bcrypt.hash("admin")
        conn.execute(
            """INSERT INTO users (id, username, email, password_hash, is_admin, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, 1, ?, ?)""",
            (user_id, "admin", "admin@productor.local", password_hash, now, now),
        )
        conn.commit()
        logger.info("Default admin user created (admin/admin)")
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Allowed column names for dynamic UPDATE statements to prevent SQL injection.
_ALLOWED_USER_COLUMNS = frozenset({
    "username", "email", "password_hash", "is_admin", "is_active", "updated_at",
})
_ALLOWED_PROJECT_COLUMNS = frozenset({
    "name", "description", "status", "version", "category", "owner_id",
    "chat_model", "image_model", "comprehensive_model",
    "default_image_resolution", "default_image_ratio",
    "raw_requirement", "structured_requirement", "pages_plan",
    "prd_content", "design_images", "history", "chat_history",
    "prd_versions", "design_versions",
    "comprehensive_content", "comprehensive_versions",
    "updated_at",
})
_ALLOWED_SKILL_COLUMNS = frozenset({
    "display_name", "description", "category",
    "system_prompt", "user_prompt_template", "output_format", "model_type",
    "parameters", "input_variables", "extra_data",
    "is_builtin", "is_enabled", "version", "updated_at",
})


def _validate_columns(kwargs: dict, allowed: frozenset, entity: str) -> None:
    """Raise ValueError if any key in kwargs is not in the allowed set."""
    bad = set(kwargs.keys()) - allowed
    if bad:
        raise ValueError(f"Invalid column(s) for {entity}: {bad}")


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

def create_user(username: str, email: str, password: str, is_admin: bool = False) -> dict:
    user_id = uuid.uuid4().hex[:8]
    now = _now()
    password_hash = bcrypt.hash(password)
    conn = get_connection()
    try:
        conn.execute(
            """INSERT INTO users (id, username, email, password_hash, is_admin, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
            (user_id, username, email, password_hash, 1 if is_admin else 0, now, now),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _user_dict(row)
    finally:
        conn.close()


def get_user_by_id(user_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _user_dict(row) if row else None
    finally:
        conn.close()


def get_user_by_username(username: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return _user_dict(row) if row else None
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return _user_dict(row) if row else None
    finally:
        conn.close()


def verify_user_password(username: str, password: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    if not bcrypt.verify(password, row["password_hash"]):
        return None
    return _user_dict(row)


def update_user_password(user_id: str, new_password: str) -> bool:
    password_hash = bcrypt.hash(new_password)
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (password_hash, _now(), user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def list_users() -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        return [_user_dict(r) for r in rows]
    finally:
        conn.close()


def update_user(user_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    _validate_columns(kwargs, _ALLOWED_USER_COLUMNS, "users")
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [user_id]
    conn = get_connection()
    try:
        conn.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _user_dict(row) if row else None
    finally:
        conn.close()


def delete_user(user_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute("DELETE FROM users WHERE id = ? AND is_admin = 0", (user_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def _user_dict(row) -> dict:
    if not row:
        return {}
    d = dict(row)
    d.pop("password_hash", None)
    return d


# ---------------------------------------------------------------------------
# Verification Codes
# ---------------------------------------------------------------------------

def create_verification_code(email: str, purpose: str = "register") -> str:
    code_id = uuid.uuid4().hex[:8]
    code = "".join(random.choices(string.digits, k=6))
    now = _now()
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    conn = get_connection()
    try:
        # Invalidate any existing unused codes for this email/purpose
        conn.execute(
            "UPDATE verification_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0",
            (email, purpose),
        )
        conn.execute(
            """INSERT INTO verification_codes (id, email, code, purpose, expires_at, used, created_at)
               VALUES (?, ?, ?, ?, ?, 0, ?)""",
            (code_id, email, code, purpose, expires_at, now),
        )
        conn.commit()
        return code
    finally:
        conn.close()


def verify_code(email: str, code: str, purpose: str = "register") -> bool:
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        row = conn.execute(
            """SELECT id FROM verification_codes
               WHERE email = ? AND code = ? AND purpose = ? AND used = 0 AND expires_at > ?
               ORDER BY created_at DESC LIMIT 1""",
            (email, code, purpose, now),
        ).fetchone()
        if row:
            conn.execute("UPDATE verification_codes SET used = 1 WHERE id = ?", (row["id"],))
            conn.commit()
        return row is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Project Permissions
# ---------------------------------------------------------------------------

def set_project_permission(project_id: str, user_id: str, permission: str, granted_by: str) -> dict:
    perm_id = uuid.uuid4().hex[:8]
    now = _now()
    conn = get_connection()
    try:
        # Upsert permission
        existing = conn.execute(
            "SELECT id FROM project_permissions WHERE project_id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE project_permissions SET permission = ?, granted_by = ?, updated_at = ? WHERE id = ?",
                (permission, granted_by, now, existing["id"]),
            )
        else:
            conn.execute(
                """INSERT INTO project_permissions (id, project_id, user_id, permission, granted_by, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (perm_id, project_id, user_id, permission, granted_by, now, now),
            )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM project_permissions WHERE project_id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        return dict(row) if row else {}
    finally:
        conn.close()


def remove_project_permission(project_id: str, user_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM project_permissions WHERE project_id = ? AND user_id = ?",
            (project_id, user_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_project_permissions(project_id: str) -> list[dict]:
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT pp.*, u.username, u.email
               FROM project_permissions pp
               JOIN users u ON pp.user_id = u.id
               WHERE pp.project_id = ?
               ORDER BY pp.created_at""",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_user_permission_for_project(project_id: str, user_id: str) -> Optional[str]:
    """Return permission level for a user on a project: 'owner', 'edit', 'view', or None."""
    project = get_project(project_id)
    if not project:
        return None
    if project.get("owner_id") == user_id:
        return "owner"
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT permission FROM project_permissions WHERE project_id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        return row["permission"] if row else None
    finally:
        conn.close()


def list_projects_for_user(user_id: str, category: str = "active", search: str = "") -> list[dict]:
    """List projects owned by or shared with a user."""
    conn = get_connection()
    try:
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
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Projects CRUD (updated with owner_id)
# ---------------------------------------------------------------------------

def create_project(
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
    conn = get_connection()
    try:
        conn.execute(
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
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row)
    finally:
        conn.close()


def list_projects(
    category: str = "active",
    search: str = "",
) -> list[dict]:
    conn = get_connection()
    try:
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
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_project(project_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_project(project_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    _validate_columns(kwargs, _ALLOWED_PROJECT_COLUMNS, "projects")
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [project_id]
    conn = get_connection()
    try:
        conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_project(project_id: str) -> bool:
    """Soft delete: set category to 'deleted'."""
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE projects SET category = 'deleted', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def archive_project(project_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE projects SET category = 'archived', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def restore_project(project_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute(
            "UPDATE projects SET category = 'active', updated_at = ? WHERE id = ?",
            (_now(), project_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def permanently_delete_project(project_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


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
    try:
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
        return dict(row)
    finally:
        conn.close()


def list_skills(category: str = None, is_enabled: bool = None) -> list[dict]:
    conn = get_connection()
    try:
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
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_skill(skill_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_skill_by_name(name: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM skills WHERE name = ? AND is_enabled = 1", (name,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def update_skill(skill_id: str, **kwargs) -> Optional[dict]:
    kwargs["updated_at"] = _now()
    _validate_columns(kwargs, _ALLOWED_SKILL_COLUMNS, "skills")
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [skill_id]
    conn = get_connection()
    try:
        conn.execute(f"UPDATE skills SET {set_clause} WHERE id = ?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_skill(skill_id: str) -> bool:
    conn = get_connection()
    try:
        # Only allow deleting non-builtin skills
        cursor = conn.execute(
            "DELETE FROM skills WHERE id = ? AND is_builtin = 0",
            (skill_id,),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def skill_exists(name: str) -> bool:
    conn = get_connection()
    try:
        row = conn.execute("SELECT 1 FROM skills WHERE name = ?", (name,)).fetchone()
        return row is not None
    finally:
        conn.close()
