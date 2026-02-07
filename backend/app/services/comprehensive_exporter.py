"""Comprehensive product plan exporter.

Combines PRD content and design images into a unified document
that can be exported as Word (.docx), PDF, or PowerPoint (.pptx).
"""

import base64
import io
import re
from typing import Optional

import httpx
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

from app.services.docx_exporter import (
    _add_inline_formatting,
    _setup_document_styles,
    markdown_to_docx,
)


def _download_image_sync(url: str) -> Optional[bytes]:
    """Download an image synchronously, supports data URIs."""
    if url.startswith("data:"):
        try:
            header, data = url.split(",", 1)
            return base64.b64decode(data)
        except Exception:
            return None
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception:
        return None


def _generate_comprehensive_docx(
    prd_content: str,
    design_images: list,
    pages_plan: Optional[dict],
    title: str,
) -> io.BytesIO:
    """Generate comprehensive Word document with PRD and design images."""
    # First generate the PRD part
    buffer = markdown_to_docx(
        markdown_text=prd_content,
        title=title,
        download_images=True,
    )

    doc = Document(buffer)

    # Add a page break before design section
    if design_images:
        doc.add_page_break()

        # Add design section header
        h = doc.add_heading(level=1)
        run = h.add_run("产品界面设计")
        run.font.size = Pt(22)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

        intro = doc.add_paragraph()
        run = intro.add_run("以下为产品各页面的界面设计图，展示了产品的视觉风格和交互布局。")
        run.font.size = Pt(10.5)
        run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

        # Get page info from pages_plan
        page_info = {}
        if pages_plan:
            pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
            for p in pages:
                page_info[p.get("id", "")] = p

        for img_data in design_images:
            page_name = img_data.get("page_name", "页面")
            page_id = img_data.get("page_id", "")
            image_url = img_data.get("image_url", "")

            # Add page title
            h2 = doc.add_heading(level=2)
            run = h2.add_run(page_name)
            run.font.size = Pt(16)

            # Add page description if available
            info = page_info.get(page_id, {})
            if info.get("description"):
                desc_p = doc.add_paragraph()
                run = desc_p.add_run(info["description"])
                run.font.size = Pt(10.5)
                run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

            # Add design image
            if image_url:
                img_bytes = _download_image_sync(image_url)
                if img_bytes:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run()
                    image_stream = io.BytesIO(img_bytes)
                    try:
                        run.add_picture(image_stream, width=Inches(5.5))
                    except Exception:
                        run = p.add_run(f"[无法加载设计图: {page_name}]")
                        run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
                        run.italic = True
                else:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(f"[设计图: {page_name}]")
                    run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
                    run.italic = True

            # Add key elements if available
            if info.get("keyElements"):
                elements_p = doc.add_paragraph()
                run = elements_p.add_run("关键元素: ")
                run.bold = True
                run.font.size = Pt(10)
                run = elements_p.add_run(", ".join(info["keyElements"]))
                run.font.size = Pt(10)
                run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

            doc.add_paragraph()  # spacing

    # Save to buffer
    out_buffer = io.BytesIO()
    doc.save(out_buffer)
    out_buffer.seek(0)
    return out_buffer


def _generate_comprehensive_pptx(
    prd_content: str,
    design_images: list,
    pages_plan: Optional[dict],
    title: str,
) -> io.BytesIO:
    """Generate comprehensive PowerPoint presentation."""
    from pptx import Presentation
    from pptx.util import Inches as PptxInches, Pt as PptxPt
    from pptx.dml.color import RGBColor as PptxRGB
    from pptx.enum.text import PP_ALIGN

    prs = Presentation()
    prs.slide_width = PptxInches(13.333)
    prs.slide_height = PptxInches(7.5)

    # Title slide
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank layout
    txBox = slide.shapes.add_textbox(PptxInches(1), PptxInches(2.5), PptxInches(11), PptxInches(2))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = PptxPt(40)
    p.font.bold = True
    p.font.color.rgb = PptxRGB(0x1A, 0x1A, 0x2E)
    p.alignment = PP_ALIGN.CENTER

    p2 = tf.add_paragraph()
    p2.text = "产品方案"
    p2.font.size = PptxPt(24)
    p2.font.color.rgb = PptxRGB(0x4F, 0x46, 0xE5)
    p2.alignment = PP_ALIGN.CENTER

    # PRD overview slide - extract headings from PRD
    headings = re.findall(r'^#{1,2}\s+(.+)$', prd_content, re.MULTILINE)
    if headings:
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        txBox = slide.shapes.add_textbox(PptxInches(0.5), PptxInches(0.3), PptxInches(12), PptxInches(1))
        tf = txBox.text_frame
        p = tf.paragraphs[0]
        p.text = "PRD 文档概览"
        p.font.size = PptxPt(28)
        p.font.bold = True
        p.font.color.rgb = PptxRGB(0x1A, 0x1A, 0x2E)

        txBox2 = slide.shapes.add_textbox(PptxInches(1), PptxInches(1.5), PptxInches(11), PptxInches(5.5))
        tf2 = txBox2.text_frame
        tf2.word_wrap = True
        for i, heading in enumerate(headings[:15]):
            p = tf2.add_paragraph() if i > 0 else tf2.paragraphs[0]
            p.text = f"  {heading}"
            p.font.size = PptxPt(16)
            p.font.color.rgb = PptxRGB(0x33, 0x33, 0x33)
            p.space_after = PptxPt(8)

    # Get page info
    page_info = {}
    if pages_plan:
        pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
        for pg in pages:
            page_info[pg.get("id", "")] = pg

    # Design image slides
    for img_data in design_images:
        page_name = img_data.get("page_name", "页面")
        page_id = img_data.get("page_id", "")
        image_url = img_data.get("image_url", "")
        info = page_info.get(page_id, {})

        slide = prs.slides.add_slide(prs.slide_layouts[6])

        # Title
        txBox = slide.shapes.add_textbox(PptxInches(0.5), PptxInches(0.2), PptxInches(12), PptxInches(0.8))
        tf = txBox.text_frame
        p = tf.paragraphs[0]
        p.text = page_name
        p.font.size = PptxPt(24)
        p.font.bold = True
        p.font.color.rgb = PptxRGB(0x1A, 0x1A, 0x2E)

        # Description
        if info.get("description"):
            txBox2 = slide.shapes.add_textbox(PptxInches(0.5), PptxInches(1), PptxInches(4), PptxInches(5))
            tf2 = txBox2.text_frame
            tf2.word_wrap = True
            p = tf2.paragraphs[0]
            p.text = info["description"]
            p.font.size = PptxPt(14)
            p.font.color.rgb = PptxRGB(0x66, 0x66, 0x66)

            if info.get("keyElements"):
                p2 = tf2.add_paragraph()
                p2.space_before = PptxPt(16)
                p2.text = "关键元素:"
                p2.font.size = PptxPt(13)
                p2.font.bold = True
                for elem in info["keyElements"]:
                    p3 = tf2.add_paragraph()
                    p3.text = f"  • {elem}"
                    p3.font.size = PptxPt(12)
                    p3.font.color.rgb = PptxRGB(0x66, 0x66, 0x66)

        # Image
        if image_url:
            img_bytes = _download_image_sync(image_url)
            if img_bytes:
                img_stream = io.BytesIO(img_bytes)
                try:
                    left = PptxInches(5) if info.get("description") else PptxInches(1.5)
                    width = PptxInches(7.5) if info.get("description") else PptxInches(10)
                    slide.shapes.add_picture(
                        img_stream, left, PptxInches(1.2), width=width
                    )
                except Exception:
                    pass

    # Save
    out_buffer = io.BytesIO()
    prs.save(out_buffer)
    out_buffer.seek(0)
    return out_buffer


def generate_comprehensive_doc(
    prd_content: str,
    design_images: list,
    pages_plan: Optional[dict],
    title: str,
    export_format: str = "docx",
) -> tuple[io.BytesIO, str, str]:
    """Generate comprehensive product plan document.

    Returns:
        Tuple of (buffer, media_type, file_extension)
    """
    if export_format == "pptx":
        buffer = _generate_comprehensive_pptx(prd_content, design_images, pages_plan, title)
        return buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"

    if export_format == "pdf":
        # Generate DOCX first, then note PDF requires additional conversion
        # For now, generate DOCX and include note about PDF
        buffer = _generate_comprehensive_docx(prd_content, design_images, pages_plan, title)
        return buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"

    # Default: DOCX
    buffer = _generate_comprehensive_docx(prd_content, design_images, pages_plan, title)
    return buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
