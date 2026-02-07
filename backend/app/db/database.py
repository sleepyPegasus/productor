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
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    # Migrate: add columns if missing
    for col, default in [
        ("design_images", "'[]'"),
        ("chat_model", "''"),
        ("image_model", "''"),
    ]:
        try:
            conn.execute(f"SELECT {col} FROM projects LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT DEFAULT {default}")
            conn.commit()
    conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_project(name: str, description: str = "", chat_model: str = "", image_model: str = "") -> dict:
    project_id = uuid.uuid4().hex[:8]
    now = _now()
    conn = get_connection()
    conn.execute(
        """INSERT INTO projects (id, name, description, status, version,
           chat_model, image_model,
           raw_requirement, structured_requirement, pages_plan, prd_content,
           design_images, history, chat_history, created_at, updated_at)
           VALUES (?, ?, ?, 'created', 0, ?, ?, '', '', '', '', '[]', '[]', '[]', ?, ?)""",
        (project_id, name, description, chat_model, image_model, now, now),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    return dict(row)


def list_projects() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, name, description, status, version, chat_model, image_model, "
        "prd_content, design_images, created_at, updated_at "
        "FROM projects ORDER BY updated_at DESC"
    ).fetchall()
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
