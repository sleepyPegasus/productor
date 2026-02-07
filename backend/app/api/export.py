"""PRD export API endpoints."""

import json
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.db.database import get_project
from app.services.docx_exporter import markdown_to_docx
from app.services.comprehensive_exporter import generate_comprehensive_doc

router = APIRouter(prefix="/api/projects", tags=["export"])


class ComprehensiveExportRequest(BaseModel):
    format: str = Field(default="docx", description="Export format: docx, pdf, pptx")


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


@router.post("/{project_id}/export/comprehensive")
async def api_export_comprehensive(project_id: str, body: ComprehensiveExportRequest):
    """Export comprehensive product plan combining PRD and design images.

    Supports Word (.docx), PDF, and PPT (.pptx) formats.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    prd_content = project.get("prd_content", "")
    if not prd_content:
        raise HTTPException(status_code=400, detail="PRD 内容为空，请先生成 PRD")

    project_name = project.get("name", "产品方案")

    design_images = []
    if project.get("design_images"):
        try:
            design_images = json.loads(project["design_images"])
        except json.JSONDecodeError:
            pass

    pages_plan = None
    if project.get("pages_plan"):
        try:
            pages_plan = json.loads(project["pages_plan"])
        except json.JSONDecodeError:
            pass

    export_format = body.format.lower()
    if export_format not in ("docx", "pdf", "pptx"):
        raise HTTPException(status_code=400, detail="不支持的导出格式，请选择 docx, pdf 或 pptx")

    buffer, media_type, ext = generate_comprehensive_doc(
        prd_content=prd_content,
        design_images=design_images,
        pages_plan=pages_plan,
        title=project_name,
        export_format=export_format,
    )

    version = project.get("version", 1)
    filename = f"{project_name}_产品方案_v{version}.{ext}"
    encoded_filename = quote(filename)

    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )
