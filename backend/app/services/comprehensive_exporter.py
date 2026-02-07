"""Comprehensive product plan exporter.

Combines PRD content and design images into a unified document
that can be exported as Word (.docx), PDF, or PowerPoint (.pptx).
"""

import base64
import io
import logging
import re
import tempfile
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

logger = logging.getLogger(__name__)


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


def _generate_comprehensive_pdf(
    prd_content: str,
    design_images: list,
    pages_plan: Optional[dict],
    title: str,
) -> io.BytesIO:
    """Generate comprehensive PDF document with PRD and design images."""
    from fpdf import FPDF

    CJK_FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
    FALLBACK_FONT = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"

    class PDFDoc(FPDF):
        def header(self):
            pass

        def footer(self):
            self.set_y(-15)
            self.set_font("body", size=8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"- {self.page_no()} -", align="C")

    pdf = PDFDoc()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Register fonts with CJK support
    import os
    if os.path.exists(CJK_FONT):
        pdf.add_font("body", "", CJK_FONT, uni=True)
        pdf.add_font("body", "B", CJK_FONT, uni=True)
    elif os.path.exists(FALLBACK_FONT):
        pdf.add_font("body", "", FALLBACK_FONT, uni=True)
        pdf.add_font("body", "B", FALLBACK_FONT, uni=True)
    else:
        # Use built-in font as last resort (no CJK support)
        pdf.add_font("body", "", "Helvetica")
        pdf.add_font("body", "B", "Helvetica")

    pdf.add_page()

    # Title
    pdf.set_font("body", "B", 22)
    pdf.set_text_color(26, 26, 46)
    pdf.cell(0, 16, title, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("body", "", 12)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, "综合产品方案", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    def _safe_write(text, font_size=10.5, bold=False):
        """Write text safely, handling encoding issues."""
        pdf.set_font("body", "B" if bold else "", font_size)
        pdf.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")

    def _add_image_to_pdf(image_url, caption=""):
        """Download and add an image to the PDF."""
        img_bytes = _download_image_sync(image_url)
        if not img_bytes:
            pdf.set_font("body", "", 10)
            pdf.set_text_color(150, 150, 150)
            pdf.cell(0, 8, f"[无法加载图片: {caption}]", align="C",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            return

        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(img_bytes)
                tmp_path = tmp.name

            page_w = pdf.w - pdf.l_margin - pdf.r_margin
            max_img_w = min(page_w, 160)

            # Check remaining space, add page if needed
            remaining = pdf.h - pdf.get_y() - pdf.b_margin
            if remaining < 60:
                pdf.add_page()

            x = (pdf.w - max_img_w) / 2
            pdf.image(tmp_path, x=x, w=max_img_w)
            pdf.ln(4)

            if caption:
                pdf.set_font("body", "", 9)
                pdf.set_text_color(100, 100, 100)
                pdf.cell(0, 6, caption, align="C", new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(0, 0, 0)
                pdf.ln(4)

            os.unlink(tmp_path)
        except Exception as e:
            logger.warning("Failed to add image to PDF: %s", str(e))
            pdf.set_font("body", "", 10)
            pdf.set_text_color(150, 150, 150)
            pdf.cell(0, 8, f"[图片加载失败: {caption}]", align="C",
                     new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)

    # Parse markdown content line by line
    lines = prd_content.split("\n")
    in_table = False
    table_rows = []
    in_code_block = False
    list_indent = 0

    for line in lines:
        stripped = line.strip()

        # Code block toggle
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            if in_code_block:
                pdf.ln(2)
            continue

        if in_code_block:
            pdf.set_font("body", "", 9)
            pdf.set_text_color(50, 50, 50)
            pdf.set_fill_color(241, 245, 249)
            pdf.multi_cell(0, 5, line, new_x="LMARGIN", new_y="NEXT", fill=True)
            pdf.set_text_color(0, 0, 0)
            continue

        # Table handling
        if stripped.startswith("|") and stripped.endswith("|"):
            if not in_table:
                in_table = True
                table_rows = []
            # Skip separator rows
            if re.match(r"^\|[\s\-:|]+\|$", stripped):
                continue
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            table_rows.append(cells)
            continue
        elif in_table:
            # Flush table
            in_table = False
            if table_rows:
                num_cols = max(len(r) for r in table_rows) if table_rows else 1
                col_w = (pdf.w - pdf.l_margin - pdf.r_margin) / num_cols
                pdf.set_font("body", "", 9)
                for row_idx, row in enumerate(table_rows):
                    row_h = 7
                    for ci in range(num_cols):
                        cell_text = row[ci] if ci < len(row) else ""
                        if row_idx == 0:
                            pdf.set_font("body", "B", 9)
                            pdf.set_fill_color(240, 240, 240)
                            pdf.cell(col_w, row_h, cell_text, border=1, fill=True)
                            pdf.set_font("body", "", 9)
                        else:
                            pdf.cell(col_w, row_h, cell_text, border=1)
                    pdf.ln(row_h)
                pdf.ln(4)
            table_rows = []

        # Empty line
        if not stripped:
            pdf.ln(3)
            continue

        # Horizontal rule
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", stripped):
            y = pdf.get_y()
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(6)
            continue

        # Headings
        heading_match = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2).strip()
            sizes = {1: 20, 2: 16, 3: 14, 4: 12}
            font_size = sizes.get(level, 12)

            if level <= 2:
                # Check remaining space
                remaining = pdf.h - pdf.get_y() - pdf.b_margin
                if remaining < 30:
                    pdf.add_page()
                pdf.ln(6)

            pdf.set_font("body", "B", font_size)
            pdf.set_text_color(26, 26, 46)
            pdf.multi_cell(0, font_size * 0.6, text, new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)

            if level <= 2:
                y = pdf.get_y()
                pdf.set_draw_color(220, 220, 220)
                pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(4)
            continue

        # Images
        img_match = re.match(r"^!\[([^\]]*)\]\((.+)\)$", stripped)
        if img_match:
            alt = img_match.group(1)
            src = img_match.group(2)
            _add_image_to_pdf(src, alt)
            continue

        # List items
        list_match = re.match(r"^(\s*)([-*+]|\d+[.)]) (.+)$", stripped)
        if list_match:
            indent = len(list_match.group(1))
            marker = list_match.group(2)
            text = list_match.group(3)
            # Clean inline markdown
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            text = re.sub(r"\*(.+?)\*", r"\1", text)
            text = re.sub(r"`(.+?)`", r"\1", text)
            text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

            x_offset = pdf.l_margin + (indent // 2) * 6
            bullet = "- " if marker in "-*+" else f"{marker} "

            pdf.set_font("body", "", 10.5)
            pdf.set_x(x_offset)
            pdf.multi_cell(pdf.w - x_offset - pdf.r_margin, 6,
                           f"{bullet}{text}", new_x="LMARGIN", new_y="NEXT")
            continue

        # Blockquote
        if stripped.startswith(">"):
            text = re.sub(r"^>\s*", "", stripped)
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
            text = re.sub(r"`(.+?)`", r"\1", text)
            pdf.set_font("body", "", 10.5)
            pdf.set_text_color(100, 100, 100)
            x = pdf.l_margin + 8
            pdf.set_x(x)
            pdf.multi_cell(pdf.w - x - pdf.r_margin, 6, text,
                           new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            continue

        # Regular paragraph
        text = stripped
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
        text = re.sub(r"\*(.+?)\*", r"\1", text)
        text = re.sub(r"`(.+?)`", r"\1", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)

        pdf.set_font("body", "", 10.5)
        pdf.set_text_color(51, 51, 51)
        pdf.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)

    # Flush remaining table if any
    if in_table and table_rows:
        num_cols = max(len(r) for r in table_rows) if table_rows else 1
        col_w = (pdf.w - pdf.l_margin - pdf.r_margin) / num_cols
        pdf.set_font("body", "", 9)
        for row_idx, row in enumerate(table_rows):
            row_h = 7
            for ci in range(num_cols):
                cell_text = row[ci] if ci < len(row) else ""
                if row_idx == 0:
                    pdf.set_font("body", "B", 9)
                    pdf.set_fill_color(240, 240, 240)
                    pdf.cell(col_w, row_h, cell_text, border=1, fill=True)
                    pdf.set_font("body", "", 9)
                else:
                    pdf.cell(col_w, row_h, cell_text, border=1)
            pdf.ln(row_h)

    # Add design images section if not already embedded
    if design_images:
        page_info = {}
        if pages_plan:
            pages = pages_plan.get("pages", []) if isinstance(pages_plan, dict) else pages_plan
            for p in pages:
                page_info[p.get("id", "")] = p

        # Check if any image URLs appear in the content already
        has_embedded_images = any(
            img.get("image_url", "")[:50] in prd_content
            for img in design_images
            if img.get("image_url")
        )

        if not has_embedded_images:
            pdf.add_page()
            pdf.set_font("body", "B", 20)
            pdf.set_text_color(26, 26, 46)
            pdf.cell(0, 14, "产品界面设计", align="L", new_x="LMARGIN", new_y="NEXT")
            pdf.ln(4)
            pdf.set_font("body", "", 10.5)
            pdf.set_text_color(100, 100, 100)
            pdf.multi_cell(0, 6,
                           "以下为产品各页面的界面设计图，展示了产品的视觉风格和交互布局。",
                           new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(0, 0, 0)
            pdf.ln(6)

            for img_data in design_images:
                page_name = img_data.get("page_name", "页面")
                page_id = img_data.get("page_id", "")
                image_url = img_data.get("image_url", "")
                info = page_info.get(page_id, {})

                pdf.set_font("body", "B", 14)
                pdf.set_text_color(26, 26, 46)
                pdf.cell(0, 10, page_name, new_x="LMARGIN", new_y="NEXT")
                pdf.set_text_color(0, 0, 0)

                if info.get("description"):
                    pdf.set_font("body", "", 10)
                    pdf.set_text_color(100, 100, 100)
                    pdf.multi_cell(0, 6, info["description"],
                                   new_x="LMARGIN", new_y="NEXT")
                    pdf.set_text_color(0, 0, 0)
                    pdf.ln(2)

                if image_url:
                    _add_image_to_pdf(image_url, f"{page_name} 界面设计图")

                pdf.ln(6)

    out_buffer = io.BytesIO()
    pdf.output(out_buffer)
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
        buffer = _generate_comprehensive_pdf(prd_content, design_images, pages_plan, title)
        return buffer, "application/pdf", "pdf"

    # Default: DOCX
    buffer = _generate_comprehensive_docx(prd_content, design_images, pages_plan, title)
    return buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
