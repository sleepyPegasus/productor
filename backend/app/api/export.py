"""PRD export API endpoints."""

from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.db.database import get_project
from app.services.docx_exporter import markdown_to_docx

router = APIRouter(prefix="/api/projects", tags=["export"])


@router.get("/{project_id}/export/docx")
async def api_export_docx(project_id: str):
    """Export PRD content as a Word (.docx) document.

    Downloads and embeds any images referenced in the markdown.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    prd_content = project.get("prd_content", "")
    if not prd_content:
        raise HTTPException(status_code=400, detail="PRD 内容为空，请先生成 PRD")

    project_name = project.get("name", "PRD文档")

    buffer = markdown_to_docx(
        markdown_text=prd_content,
        title=project_name,
        download_images=True,
    )

    filename = f"{project_name}_PRD_v{project.get('version', 1)}.docx"
    encoded_filename = quote(filename)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )
