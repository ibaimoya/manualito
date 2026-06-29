"""Validación segura de imágenes de manual."""

from io import BytesIO

import anyio
import pypdfium2 as pdfium
from fastapi import UploadFile
from PIL import Image

from api import config
from api.exceptions import (
    ImageTooLargeError,
    InvalidImageError,
    InvalidPdfError,
    ManualPageLimitExceededError,
    PdfTooLargeError,
)
from api.manuals.dto import ValidatedManualImage, ValidatedManualPdf
from api.manuals.pdfium import run_pdfium
from common.crypto import sha256_hex

JPEG_MIME_TYPE = "image/jpeg"
PNG_MIME_TYPE = "image/png"
WEBP_MIME_TYPE = "image/webp"
PDF_MIME_TYPE = "application/pdf"
PDF_EXTENSION = ".pdf"
PDF_SIGNATURE = b"%PDF-"

ALLOWED_IMAGE_MIME_TYPES = {
    JPEG_MIME_TYPE,
    PNG_MIME_TYPE,
    WEBP_MIME_TYPE,
}

IMAGE_FORMAT_TO_MIME = {
    "JPEG": JPEG_MIME_TYPE,
    "MPO": JPEG_MIME_TYPE,
    "PNG": PNG_MIME_TYPE,
    "WEBP": WEBP_MIME_TYPE,
}

IMAGE_MIME_TO_EXTENSION = {
    JPEG_MIME_TYPE: ".jpg",
    PNG_MIME_TYPE: ".png",
    WEBP_MIME_TYPE: ".webp",
}


async def validate_manual_image(image: UploadFile) -> ValidatedManualImage:
    """Valida tamaño, MIME declarado y firma real de la imagen."""
    content = await image.read(config.MAX_IMAGE_SIZE + 1)
    return await anyio.to_thread.run_sync(
        _validate_manual_image_content,
        content,
        image.content_type,
    )


async def validate_manual_pdf(pdf: UploadFile) -> ValidatedManualPdf:
    """Valida tamaño, MIME declarado, firma real y número de páginas."""
    content = await pdf.read(config.MAX_MANUAL_PDF_SIZE + 1)
    return await run_pdfium(
        _validate_manual_pdf_content,
        content,
        pdf.content_type,
    )


def _validate_manual_image_content(
    content: bytes,
    declared_mime_type: str | None,
) -> ValidatedManualImage:
    """Ejecuta la validación CPU-bound fuera del event loop."""
    if len(content) > config.MAX_IMAGE_SIZE:
        raise ImageTooLargeError
    if declared_mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise InvalidImageError

    try:
        with Image.open(BytesIO(content)) as candidate:
            candidate.verify()
        with Image.open(BytesIO(content)) as verified:
            image_format = verified.format
            if image_format is None:
                raise InvalidImageError
            mime_type = IMAGE_FORMAT_TO_MIME[image_format]
            width, height = verified.size
    except (Image.DecompressionBombError, KeyError, OSError):
        raise InvalidImageError from None

    if mime_type != declared_mime_type:
        raise InvalidImageError
    if width * height > config.MAX_IMAGE_PIXELS:
        raise InvalidImageError

    return ValidatedManualImage(
        content=content,
        mime_type=mime_type,
        extension=IMAGE_MIME_TO_EXTENSION[mime_type],
        width=width,
        height=height,
        sha256=sha256_hex(content),
    )


def _validate_manual_pdf_content(
    content: bytes,
    declared_mime_type: str | None,
) -> ValidatedManualPdf:
    """Ejecuta la validación PDF CPU-bound fuera del event loop."""
    if len(content) > config.MAX_MANUAL_PDF_SIZE:
        raise PdfTooLargeError
    if declared_mime_type != PDF_MIME_TYPE or not content.startswith(PDF_SIGNATURE):
        raise InvalidPdfError

    try:
        with pdfium.PdfDocument(content) as document:
            page_count = len(document)
    except (pdfium.PdfiumError, OSError, ValueError):
        raise InvalidPdfError from None

    if page_count <= 0:
        raise InvalidPdfError
    if page_count > config.MAX_MANUAL_PAGES:
        raise ManualPageLimitExceededError

    return ValidatedManualPdf(
        content=content,
        mime_type=PDF_MIME_TYPE,
        extension=PDF_EXTENSION,
        page_count=page_count,
        sha256=sha256_hex(content),
    )
