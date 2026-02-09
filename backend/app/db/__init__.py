"""Database module.

This module exports both synchronous and asynchronous database functions.
The synchronous functions are from database.py (legacy, for backward compatibility).
The asynchronous functions are from database_async.py (recommended for FastAPI).

Recommended usage in FastAPI endpoints:
    from app.db import get_project_async, update_project_async
    
    @router.get("/{project_id}")
    async def get_project(project_id: str):
        project = await get_project_async(project_id)
        return project
"""

# Synchronous exports (legacy)
from .database import (
    init_db,
    init_admin_user,
    get_connection,
    get_db_path,
    # Users
    create_user,
    get_user_by_id,
    get_user_by_username,
    get_user_by_email,
    verify_user_password,
    update_user_password,
    list_users,
    update_user,
    delete_user,
    # Projects
    create_project,
    get_project,
    update_project,
    delete_project,
    archive_project,
    restore_project,
    list_projects,
    list_projects_for_user,
    # Chat
    get_chat_history,
    update_chat_history,
    append_chat_message,
    # Versions
    get_prd_versions,
    save_prd_version,
    get_design_versions,
    save_design_version,
    get_comprehensive_versions,
    save_comprehensive_version,
    get_prd_version_content,
    get_design_version_images,
    get_comprehensive_version_content,
    # Permissions
    get_project_permissions,
    set_project_permission,
    remove_project_permission,
    get_user_permission_for_project,
    # Skills
    get_skill_by_name,
    list_skills,
    create_skill,
    update_skill,
    delete_skill,
    skill_exists,
    # Verification codes
    create_verification_code,
    verify_code,
)

# Asynchronous exports (recommended for FastAPI)
from .database_async import (
    get_connection as get_async_connection,
    # Users
    get_user_by_id_async,
    get_user_by_username_async,
    verify_user_password_async,
    create_user_async,
    update_user_async,
    list_users_async,
    # Projects
    get_project_async,
    create_project_async,
    update_project_async,
    list_projects_for_user_async,
    delete_project_async,
    archive_project_async,
    restore_project_async,
    # Chat
    get_chat_history_async,
    update_chat_history_async,
    append_chat_message_async,
    # Versions
    get_prd_versions_async,
    save_prd_version_async,
    # Permissions
    get_project_permissions_async,
    get_user_permission_for_project_async,
    # Skills
    get_skill_by_name_async,
    list_skills_async,
)

__all__ = [
    # Sync
    "init_db",
    "init_admin_user",
    "get_connection",
    "get_db_path",
    # Async connection
    "get_async_connection",
    # Users (sync)
    "create_user",
    "get_user_by_id",
    "get_user_by_username",
    "get_user_by_email",
    "verify_user_password",
    "update_user_password",
    "list_users",
    "update_user",
    "delete_user",
    # Users (async)
    "get_user_by_id_async",
    "get_user_by_username_async",
    "verify_user_password_async",
    "create_user_async",
    "update_user_async",
    "list_users_async",
    # Projects (sync)
    "create_project",
    "get_project",
    "update_project",
    "delete_project",
    "archive_project",
    "restore_project",
    "list_projects",
    "list_projects_for_user",
    # Projects (async)
    "get_project_async",
    "create_project_async",
    "update_project_async",
    "list_projects_for_user_async",
    "delete_project_async",
    "archive_project_async",
    "restore_project_async",
    # Chat (sync)
    "get_chat_history",
    "update_chat_history",
    "append_chat_message",
    # Chat (async)
    "get_chat_history_async",
    "update_chat_history_async",
    "append_chat_message_async",
    # Versions (sync)
    "get_prd_versions",
    "save_prd_version",
    "get_design_versions",
    "save_design_version",
    "get_comprehensive_versions",
    "save_comprehensive_version",
    "get_prd_version_content",
    "get_design_version_images",
    "get_comprehensive_version_content",
    # Versions (async)
    "get_prd_versions_async",
    "save_prd_version_async",
    # Permissions (sync)
    "get_project_permissions",
    "set_project_permission",
    "remove_project_permission",
    "get_user_permission_for_project",
    # Permissions (async)
    "get_project_permissions_async",
    "get_user_permission_for_project_async",
    # Skills (sync)
    "get_skill_by_name",
    "list_skills",
    "create_skill",
    "update_skill",
    "delete_skill",
    "skill_exists",
    # Skills (async)
    "get_skill_by_name_async",
    "list_skills_async",
    # Verification codes (sync)
    "create_verification_code",
    "verify_code",
]
