"""Extracción y renderizado de páginas PDF para manuales."""

from __future__ import annotations

import re
from contextlib import closing
from io import BytesIO
from math import sqrt

import pypdfium2 as pdfium

from api import config
from api.exceptions import InvalidPdfError
from api.manuals.pdfium import run_pdfium
from api.manuals.validation import JPEG_MIME_TYPE, ValidatedManualImage
from common.crypto import sha256_hex

PDF_POINTS_PER_INCH = 72
JPEG_EXTENSION = ".jpg"
RENDER_CAP_MARGIN = 0.95
WORD_RE = re.compile(r"\w+", re.UNICODE)
ALLOWED_CONTROL_CHARS = {"\n", "\r", "\t"}


async def extract_pdf_page_text(content: bytes, *, page_number: int) -> str:
    """Extrae texto embebido de una página PDF concreta."""
    return await run_pdfium(_extract_pdf_page_text, content, page_number)


async def render_pdf_page(content: bytes, *, page_number: int) -> ValidatedManualImage:
    """Convierte una página PDF a JPEG para pasarla por OCR."""
    return await run_pdfium(_render_pdf_page, content, page_number)


def pdf_text_is_usable(text: str) -> bool:
    """Decide si la capa de texto PDF es suficientemente aprovechable."""
    stripped = text.strip()
    if len(stripped) < config.PDF_TEXT_MIN_CHARS:
        return False
    if len(WORD_RE.findall(stripped)) < config.PDF_TEXT_MIN_WORDS:
        return False
    return (
        _bad_char_ratio(stripped) <= config.PDF_TEXT_MAX_BAD_CHAR_RATIO
        and _alnum_ratio(stripped) >= config.PDF_TEXT_MIN_ALNUM_RATIO
    )


def _extract_pdf_page_text(content: bytes, page_number: int) -> str:
    """Lee la capa de texto de una página PDF, si existe."""
    try:
        with pdfium.PdfDocument(content) as document, closing(
            document.get_page(page_number - 1)
        ) as page, closing(page.get_textpage()) as text_page:
            return text_page.get_text_range().strip()
    except (pdfium.PdfiumError, OSError, ValueError):
        return ""


def _render_pdf_page(content: bytes, page_number: int) -> ValidatedManualImage:
    """Renderiza una página PDF validada como imagen JPEG."""
    try:
        with pdfium.PdfDocument(content) as document, closing(
            document.get_page(page_number - 1)
        ) as page:
            image = _render_page_image(page)
            width, height = image.size
    except InvalidPdfError:
        raise
    except (pdfium.PdfiumError, OSError, ValueError):
        raise InvalidPdfError from None

    output = BytesIO()
    image.save(output, format="JPEG", quality=90)
    content = output.getvalue()
    return ValidatedManualImage(
        content=content,
        mime_type=JPEG_MIME_TYPE,
        extension=JPEG_EXTENSION,
        width=width,
        height=height,
        sha256=sha256_hex(content),
    )


def _render_page_image(page):
    """Renderiza ajustando escala si la página supera el límite de píxeles."""
    scale = _render_scale(page)
    for _ in range(3):
        bitmap = page.render(scale=scale)
        try:
            image = bitmap.to_pil().convert("RGB").copy()
        finally:
            bitmap.close()
        width, height = image.size
        pixels = width * height
        if pixels <= config.MAX_IMAGE_PIXELS:
            return image
        scale *= sqrt(config.MAX_IMAGE_PIXELS / pixels) * RENDER_CAP_MARGIN
    raise InvalidPdfError


def _render_scale(page) -> float:
    """Calcula la escala de render dentro del DPI objetivo y el cap de píxeles."""
    width_points, height_points = page.get_size()
    if width_points <= 0 or height_points <= 0:
        raise InvalidPdfError
    target_scale = config.PDF_RENDER_DPI / PDF_POINTS_PER_INCH
    max_scale = sqrt(config.MAX_IMAGE_PIXELS / (width_points * height_points))
    if target_scale <= max_scale:
        return target_scale
    return max_scale * RENDER_CAP_MARGIN


def _bad_char_ratio(text: str) -> float:
    """Mide caracteres sospechosos en el texto extraído del PDF."""
    bad_chars = sum(1 for char in text if _is_bad_char(char))
    return bad_chars / len(text) if text else 1.0


def _alnum_ratio(text: str) -> float:
    """Mide cuánto texto útil hay tras descartar espacios y basura."""
    chars = [char for char in text if not char.isspace() and not _is_bad_char(char)]
    if not chars:
        return 0.0
    return sum(char.isalnum() for char in chars) / len(chars)


def _is_bad_char(char: str) -> bool:
    """Detecta caracteres de reemplazo o controles no permitidos."""
    return char == "\ufffd" or (char.isprintable() is False and char not in ALLOWED_CONTROL_CHARS)
