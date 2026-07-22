"""Extracción y renderizado de páginas PDF para manuales."""

from __future__ import annotations

import re
from contextlib import closing
from math import sqrt
from pathlib import Path
from typing import Protocol

import pypdfium2 as pdfium
from PIL import Image

from api import config
from api.assets.storage import AssetSizeExceededError, AssetWriteBatch
from api.exceptions import InvalidPdfError
from api.manuals.dto import ValidatedManualImage
from api.manuals.pdfium import run_pdfium
from api.manuals.validation import JPEG_MIME_TYPE

PDF_POINTS_PER_INCH = 72
JPEG_EXTENSION = ".jpg"
RENDER_CAP_MARGIN = 0.95
WORD_RE = re.compile(r"\w+", re.UNICODE)
ALLOWED_CONTROL_CHARS = {"\n", "\r", "\t"}


class _PdfBitmap(Protocol):
    def close(self) -> None: ...
    def to_pil(self) -> Image.Image: ...


class _PdfPage(Protocol):
    def get_size(self) -> tuple[float, float]: ...
    def render(self, *, scale: float) -> _PdfBitmap: ...


async def extract_pdf_page_text(pdf_path: Path, *, page_number: int) -> str:
    """Extrae texto embebido de una página PDF concreta."""
    return await run_pdfium(_extract_pdf_page_text, pdf_path, page_number)


async def render_pdf_page(
    pdf_path: Path,
    *,
    page_number: int,
    batch: AssetWriteBatch,
) -> ValidatedManualImage:
    """Convierte una página PDF a JPEG para pasarla por OCR."""
    image = await run_pdfium(_render_pdf_page_image, pdf_path, page_number)
    width, height = image.size
    try:
        staged = await batch.stage_generated(
            lambda destination: image.save(destination, format="JPEG", quality=90),
            max_bytes=config.MAX_IMAGE_SIZE,
        )
    except AssetSizeExceededError:
        raise InvalidPdfError from None
    finally:
        image.close()
    return ValidatedManualImage(
        path=staged.path,
        byte_size=staged.byte_size,
        mime_type=JPEG_MIME_TYPE,
        extension=JPEG_EXTENSION,
        width=width,
        height=height,
        sha256=staged.sha256,
    )


def pdf_text_is_usable(text: str) -> bool:
    """Decide si la capa de texto PDF es suficientemente aprovechable."""
    stripped = text.strip()
    return (
        len(stripped) >= config.PDF_TEXT_MIN_CHARS
        and len(WORD_RE.findall(stripped)) >= config.PDF_TEXT_MIN_WORDS
        and _bad_char_ratio(stripped) <= config.PDF_TEXT_MAX_BAD_CHAR_RATIO
        and _alnum_ratio(stripped) >= config.PDF_TEXT_MIN_ALNUM_RATIO
    )


def _extract_pdf_page_text(pdf_path: Path, page_number: int) -> str:
    """Lee la capa de texto de una página PDF, si existe."""
    try:
        with (
            pdfium.PdfDocument(pdf_path) as document,
            closing(document.get_page(page_number - 1)) as page,
            closing(page.get_textpage()) as text_page,
        ):
            text = text_page.get_text_range()
            return text.strip() if isinstance(text, str) else ""
    except (pdfium.PdfiumError, OSError, ValueError):
        return ""


def _render_pdf_page_image(pdf_path: Path, page_number: int) -> Image.Image:
    """Renderiza una página PDF validada como imagen JPEG."""
    try:
        with (
            pdfium.PdfDocument(pdf_path) as document,
            closing(document.get_page(page_number - 1)) as page,
        ):
            return _render_page_image(page)
    except InvalidPdfError:
        raise
    except (pdfium.PdfiumError, OSError, ValueError):
        raise InvalidPdfError from None


def _render_page_image(page: _PdfPage) -> Image.Image:
    """Renderiza ajustando escala si la página supera el límite de píxeles."""
    scale = _render_scale(page)
    for _ in range(3):
        bitmap = page.render(scale=scale)
        try:
            image = bitmap.to_pil().convert("RGB")
        finally:
            bitmap.close()
        width, height = image.size
        pixels = width * height
        if pixels <= config.MAX_IMAGE_PIXELS:
            return image
        scale *= sqrt(config.MAX_IMAGE_PIXELS / pixels) * RENDER_CAP_MARGIN
    raise InvalidPdfError


def _render_scale(page: _PdfPage) -> float:
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
