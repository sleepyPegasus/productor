"""Markdown to DOCX converter for PRD export.

Converts PRD markdown content into a formatted Word document,
preserving headings, tables, lists, images, and inline formatting.
"""

import io
import re
from typing import Optional

import httpx
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


def _set_cell_shading(cell, color: str):
    """Set background shading for a table cell."""
    shading = cell._element.get_or_add_tcPr()
    shading_elem = shading.makeelement(
        qn("w:shd"),
        {
            qn("w:val"): "clear",
            qn("w:color"): "auto",
            qn("w:fill"): color,
        },
    )
    shading.append(shading_elem)


def _add_inline_formatting(paragraph, text: str):
    """Parse inline markdown formatting and add runs to a paragraph.

    Handles: **bold**, *italic*, `code`, [links](url), ![images](url)
    """
    # Pattern order matters - more specific patterns first
    patterns = [
        (r"\*\*(.+?)\*\*", "bold"),
        (r"\*(.+?)\*", "italic"),
        (r"`(.+?)`", "code"),
        (r"\[([^\]]+)\]\(([^)]+)\)", "link"),
    ]

    # Build a combined pattern
    combined = (
        r"(\*\*(.+?)\*\*)"
        r"|(\*(.+?)\*)"
        r"|(`(.+?)`)"
        r"|(\[([^\]]+)\]\(([^)]+)\))"
    )

    pos = 0
    for match in re.finditer(combined, text):
        # Add plain text before match
        if match.start() > pos:
            paragraph.add_run(text[pos : match.start()])

        if match.group(1):  # **bold**
            run = paragraph.add_run(match.group(2))
            run.bold = True
        elif match.group(3):  # *italic*
            run = paragraph.add_run(match.group(4))
            run.italic = True
        elif match.group(5):  # `code`
            run = paragraph.add_run(match.group(6))
            run.font.name = "Consolas"
            run.font.size = Pt(9)
            run.font.color.rgb = RGBColor(0xC7, 0x25, 0x4E)
        elif match.group(7):  # [text](url)
            run = paragraph.add_run(match.group(8))
            run.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)
            run.underline = True

        pos = match.end()

    # Remaining text
    if pos < len(text):
        paragraph.add_run(text[pos:])


def _parse_table_row(line: str) -> list[str]:
    """Parse a markdown table row into cell values."""
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def _is_separator_row(line: str) -> bool:
    """Check if a line is a markdown table separator (| --- | --- |)."""
    stripped = line.strip().strip("|")
    return all(
        c.strip().replace("-", "").replace(":", "") == ""
        for c in stripped.split("|")
    )


async def _download_image(url: str) -> Optional[bytes]:
    """Download an image from URL, returns bytes or None."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception:
        return None


def _download_image_sync(url: str) -> Optional[bytes]:
    """Download an image synchronously."""
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception:
        return None


def _setup_document_styles(doc: Document):
    """Configure document styles for professional PRD output."""
    style = doc.styles["Normal"]
    font = style.font
    font.name = "微软雅黑"
    font.size = Pt(10.5)
    font.color.rgb = RGBColor(0x33, 0x33, 0x33)
    style.paragraph_format.space_after = Pt(6)
    style.paragraph_format.line_spacing = 1.5

    # Set fallback East Asian font
    rpr = style.element.get_or_add_rPr()
    ea_font = rpr.makeelement(qn("w:rFonts"), {qn("w:eastAsia"): "微软雅黑"})
    rpr.append(ea_font)

    # Heading styles
    heading_configs = [
        ("Heading 1", 22, RGBColor(0x1A, 0x1A, 0x2E), True),
        ("Heading 2", 16, RGBColor(0x25, 0x63, 0xEB), True),
        ("Heading 3", 13, RGBColor(0x33, 0x33, 0x33), True),
        ("Heading 4", 11, RGBColor(0x55, 0x55, 0x55), True),
    ]
    for name, size, color, bold in heading_configs:
        if name in doc.styles:
            hs = doc.styles[name]
            hs.font.size = Pt(size)
            hs.font.color.rgb = color
            hs.font.bold = bold
            hs.font.name = "微软雅黑"
            hs.paragraph_format.space_before = Pt(12)
            hs.paragraph_format.space_after = Pt(6)


def markdown_to_docx(
    markdown_text: str,
    title: str = "PRD 文档",
    download_images: bool = True,
) -> io.BytesIO:
    """Convert markdown text to a DOCX document.

    Args:
        markdown_text: The markdown content to convert.
        title: Document title for metadata.
        download_images: Whether to download and embed images.

    Returns:
        BytesIO buffer containing the DOCX file.
    """
    doc = Document()
    _setup_document_styles(doc)

    # Set document properties
    doc.core_properties.title = title

    lines = markdown_text.split("\n")
    i = 0
    in_code_block = False
    code_block_lines = []
    in_table = False
    table_rows = []
    table_header = None

    while i < len(lines):
        line = lines[i]

        # ---- Code block handling ----
        if line.strip().startswith("```"):
            if in_code_block:
                # End code block
                code_text = "\n".join(code_block_lines)
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(6)
                run = p.add_run(code_text)
                run.font.name = "Consolas"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0xE2, 0xE8, 0xF0)
                # Add shading to the paragraph
                pPr = p._element.get_or_add_pPr()
                shading = pPr.makeelement(
                    qn("w:shd"),
                    {
                        qn("w:val"): "clear",
                        qn("w:color"): "auto",
                        qn("w:fill"): "1E293B",
                    },
                )
                pPr.append(shading)
                in_code_block = False
                code_block_lines = []
            else:
                # Flush any pending table
                if in_table:
                    _flush_table(doc, table_header, table_rows)
                    in_table = False
                    table_rows = []
                    table_header = None
                in_code_block = True
            i += 1
            continue

        if in_code_block:
            code_block_lines.append(line)
            i += 1
            continue

        # ---- Table handling ----
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            if not in_table:
                in_table = True
                table_header = _parse_table_row(line)
            elif _is_separator_row(line):
                pass  # skip separator
            else:
                table_rows.append(_parse_table_row(line))
            i += 1
            continue
        elif in_table:
            _flush_table(doc, table_header, table_rows)
            in_table = False
            table_rows = []
            table_header = None
            # Don't increment i, reprocess current line

        stripped = line.strip()

        # ---- Empty line ----
        if not stripped:
            i += 1
            continue

        # ---- Horizontal rule ----
        if stripped in ("---", "***", "___"):
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(6)
            # Add a border-bottom effect
            pPr = p._element.get_or_add_pPr()
            pBdr = pPr.makeelement(qn("w:pBdr"), {})
            bottom = pBdr.makeelement(
                qn("w:bottom"),
                {
                    qn("w:val"): "single",
                    qn("w:sz"): "6",
                    qn("w:space"): "1",
                    qn("w:color"): "CCCCCC",
                },
            )
            pBdr.append(bottom)
            pPr.append(pBdr)
            i += 1
            continue

        # ---- Headings ----
        heading_match = re.match(r"^(#{1,4})\s+(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            text = heading_match.group(2)
            p = doc.add_heading(level=level)
            _add_inline_formatting(p, text)
            i += 1
            continue

        # ---- Image (standalone line) ----
        img_match = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", stripped)
        if img_match:
            alt_text = img_match.group(1)
            img_url = img_match.group(2)

            if download_images and img_url.startswith("http"):
                img_data = _download_image_sync(img_url)
                if img_data:
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run()
                    image_stream = io.BytesIO(img_data)
                    run.add_picture(image_stream, width=Inches(5.5))
                    # Add caption
                    if alt_text:
                        cap = doc.add_paragraph()
                        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        run = cap.add_run(alt_text)
                        run.font.size = Pt(9)
                        run.font.color.rgb = RGBColor(0x88, 0x88, 0x88)
                        run.italic = True
                else:
                    # Image download failed, show as text
                    p = doc.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run(f"[图片: {alt_text}]")
                    run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
                    run.italic = True
            else:
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(f"[图片: {alt_text}]")
                run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
                run.italic = True
            i += 1
            continue

        # ---- Blockquote ----
        if stripped.startswith(">"):
            quote_text = stripped.lstrip(">").strip()
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Cm(1)
            # Add left border via XML
            pPr = p._element.get_or_add_pPr()
            pBdr = pPr.makeelement(qn("w:pBdr"), {})
            left = pBdr.makeelement(
                qn("w:left"),
                {
                    qn("w:val"): "single",
                    qn("w:sz"): "12",
                    qn("w:space"): "4",
                    qn("w:color"): "2563EB",
                },
            )
            pBdr.append(left)
            pPr.append(pBdr)
            run = p.add_run(quote_text)
            run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
            run.italic = True
            i += 1
            continue

        # ---- Unordered list ----
        ul_match = re.match(r"^(\s*)([-*+])\s+(.+)$", stripped)
        if ul_match:
            indent = len(line) - len(line.lstrip())
            level = indent // 2
            text = ul_match.group(3)

            # Check for checkbox
            checkbox_match = re.match(r"^\[([ xX])\]\s*(.+)$", text)
            if checkbox_match:
                checked = checkbox_match.group(1) in ("x", "X")
                text = ("[x] " if checked else "[ ] ") + checkbox_match.group(2)

            p = doc.add_paragraph(style="List Bullet")
            p.paragraph_format.left_indent = Cm(1.27 + level * 0.63)
            _add_inline_formatting(p, text)
            i += 1
            continue

        # ---- Ordered list ----
        ol_match = re.match(r"^(\s*)\d+[.)]\s+(.+)$", stripped)
        if ol_match:
            indent = len(line) - len(line.lstrip())
            level = indent // 2
            text = ol_match.group(2)
            p = doc.add_paragraph(style="List Number")
            p.paragraph_format.left_indent = Cm(1.27 + level * 0.63)
            _add_inline_formatting(p, text)
            i += 1
            continue

        # ---- Regular paragraph ----
        p = doc.add_paragraph()
        _add_inline_formatting(p, stripped)
        i += 1

    # Flush remaining table
    if in_table:
        _flush_table(doc, table_header, table_rows)

    # Write to buffer
    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer


def _flush_table(doc: Document, header: Optional[list[str]], rows: list[list[str]]):
    """Add a table to the document from parsed markdown table data."""
    if not header:
        return

    num_cols = len(header)
    table = doc.add_table(rows=1 + len(rows), cols=num_cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    # Header row
    for j, cell_text in enumerate(header):
        if j < num_cols:
            cell = table.rows[0].cells[j]
            cell.text = ""
            p = cell.paragraphs[0]
            run = p.add_run(cell_text)
            run.bold = True
            run.font.size = Pt(9)
            run.font.name = "微软雅黑"
            _set_cell_shading(cell, "F0F4F8")

    # Data rows
    for r_idx, row_data in enumerate(rows):
        for j, cell_text in enumerate(row_data):
            if j < num_cols:
                cell = table.rows[r_idx + 1].cells[j]
                cell.text = ""
                p = cell.paragraphs[0]
                run = p.add_run(cell_text)
                run.font.size = Pt(9)
                run.font.name = "微软雅黑"

    # Set column widths evenly
    total_width = Cm(16)
    col_width = total_width // num_cols
    for row in table.rows:
        for cell in row.cells:
            cell.width = col_width
