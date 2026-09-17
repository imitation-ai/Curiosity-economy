"""Typeset source paragraphs without rewriting them. Called by sync-book.mjs."""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.text.run import Run
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
WIDTH, HEIGHT = 432, 648
PAPER = colors.HexColor('#fcfaf5')
INK = colors.HexColor('#242322')


def register_fonts():
    for name, file in [('Book', 'Regular'), ('Book-Italic', 'Italic'), ('Book-Bold', 'SemiBold'), ('Book-BoldItalic', 'SemiBoldItalic')]:
        pdfmetrics.registerFont(TTFont(name, str(ROOT / 'assets/fonts' / f'CrimsonText-{file}.ttf')))
    pdfmetrics.registerFontFamily('Book', normal='Book', bold='Book-Bold', italic='Book-Italic', boldItalic='Book-BoldItalic')


def rich_text(paragraph):
    chunks = []
    for node in paragraph._p.iter(qn('w:r')):
        run = Run(node, paragraph)
        value = html.escape(run.text).replace('\n', '<br/>')
        if run.italic:
            value = f'<i>{value}</i>'
        if run.bold:
            value = f'<b>{value}</b>'
        chunks.append(value)
    return ''.join(chunks)


def compact(text):
    # Whitespace, line breaks and presentation punctuation are not content changes.
    return re.sub(r'[^\w]', '', text, flags=re.UNICODE).casefold()


def typeset(source, target, title, author, offset):
    document = Document(source)
    if document.tables or document.inline_shapes:
        raise ValueError('This typesetter requires text-only chapters; preserve new tables or artwork before syncing.')
    paragraphs = [p for p in document.paragraphs if p.text.strip()]
    if not paragraphs:
        raise ValueError('Empty chapter')
    source_heading = paragraphs[0].text.strip()
    parts = re.split(r'\s+[—–-]\s+', source_heading, maxsplit=1)
    label, heading = (parts[0], parts[1]) if len(parts) == 2 else ('', source_heading)
    body = paragraphs[1:]
    running = heading
    body_style = ParagraphStyle('Body', fontName='Book', fontSize=12.5, leading=17.3,
        textColor=INK, alignment=TA_JUSTIFY, firstLineIndent=14, spaceAfter=3,
        allowWidows=0, allowOrphans=0, splitLongWords=False)
    opening = ParagraphStyle('Opening', parent=body_style, firstLineIndent=0)
    subheading = ParagraphStyle('Subheading', fontName='Book-Bold', fontSize=17, leading=20,
        textColor=INK, spaceBefore=19, spaceAfter=10, keepWithNext=True)
    chapter_title = ParagraphStyle('ChapterTitle', fontName='Book', fontSize=31, leading=34,
        textColor=INK, spaceAfter=23, keepWithNext=True)
    kicker = ParagraphStyle('Kicker', fontName='Helvetica', fontSize=8, leading=12,
        textColor=colors.HexColor('#696762'), spaceAfter=18, keepWithNext=True)
    doc = BaseDocTemplate(str(target), pagesize=(WIDTH, HEIGHT), leftMargin=55, rightMargin=55,
        topMargin=61, bottomMargin=53, title=title, author=author, pageCompression=1)

    def decorate(canvas, page_doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, WIDTH, HEIGHT, stroke=0, fill=1)
        folio = offset + page_doc.page
        canvas.setFillColor(colors.HexColor('#74716b'))
        if page_doc.page > 1:
            canvas.setFont('Book', 8)
            header = author.upper() if folio % 2 == 0 else running.upper()
            canvas.drawCentredString(WIDTH / 2, HEIGHT - 34, header)
            canvas.setStrokeColor(colors.HexColor('#ddd8ce'))
            canvas.setLineWidth(.35)
            canvas.line(55, HEIGHT - 44, WIDTH - 55, HEIGHT - 44)
        canvas.setFont('Book', 9)
        canvas.drawCentredString(WIDTH / 2, 28, str(folio))
        canvas.restoreState()

    frame = Frame(55, 53, WIDTH - 110, HEIGHT - 114, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates(PageTemplate(id='BookPage', frames=[frame], onPage=decorate))
    story = [Spacer(1, 44), Paragraph(html.escape(label.upper()), kicker), Paragraph(html.escape(heading), chapter_title)]
    next_opening = True
    blocks = []
    for p in body:
        is_heading = p.style.name.lower().startswith('heading')
        markup = rich_text(p)
        if not markup.strip():
            raise ValueError('A nonempty paragraph could not be converted.')
        story.append(Paragraph(markup, subheading if is_heading else opening if next_opening else body_style))
        blocks.append({'type': 'heading' if is_heading else 'paragraph', 'text': p.text, 'html': markup})
        next_opening = is_heading
    doc.build(story)

    # Verify the actual rendered PDF, excluding only our own folios/running headings.
    rendered = []
    pdf = PdfReader(str(target))
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ''
        if i > 0:
            header = author.upper() if (offset + i + 1) % 2 == 0 else running.upper()
            text = text.replace(header, '', 1)
        text = re.sub(r'^\s*' + str(offset + i + 1) + r'\s*\n', '', text, count=1)
        if i == 0:
            # Kicker changes case only; the original chapter title remains intact.
            text = re.sub(r'^\s*' + re.escape(label.upper()) + r'\s*', '', text, count=1)
            normal_heading = compact(heading)
            normalized = compact(text)
            if not normalized.startswith(normal_heading):
                raise ValueError('Chapter heading did not survive typesetting.')
            rendered.append(normalized[len(normal_heading):])
        else:
            rendered.append(compact(text))
    expected = compact(''.join(p.text for p in body))
    actual = ''.join(rendered)
    if actual != expected:
        Path(str(target) + '.audit.json').write_text(json.dumps({'expected': expected, 'actual': actual}))
        raise ValueError(f'Text preservation check failed for {source}; no edition was published.')
    return {'pageCount': len(pdf.pages), 'title': heading, 'label': label, 'blocks': blocks,
        'sourceTextHash': hashlib.sha256(expected.encode()).hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--title', required=True)
    parser.add_argument('--author', required=True)
    parser.add_argument('--offset', type=int, required=True)
    args = parser.parse_args()
    register_fonts()
    result = typeset(args.source, args.output, args.title, args.author, args.offset)
    Path(args.output + '.json').write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps({'pages': result['pageCount'], 'textVerified': True}))
