"""Staging y validación segura de fuentes de manual por ruta local."""

import warnings
from contextlib import suppress
from pathlib import Path

import anyio
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from fastapi import UploadFile
from PIL import Image

from api import config
from api.assets.storage import AssetSizeExceededError, AssetWriteBatch, StagedAsset
from api.exceptions import (
    ImageTooLargeError,
    InvalidImageError,
    InvalidPdfError,
    ManualPageLimitExceededError,
    PdfTooLargeError,
)
from api.manuals.dto import ValidatedManualImage, ValidatedManualPdf
from api.manuals.pdfium import run_pdfium

JPEG_MIME_TYPE = "image/jpeg"
PNG_MIME_TYPE = "image/png"
WEBP_MIME_TYPE = "image/webp"
PDF_MIME_TYPE = "application/pdf"
PDF_EXTENSION = ".pdf"
PDF_SIGNATURE = b"%PDF-"

IMAGE_FORMAT_TO_MIME = {
    "JPEG": JPEG_MIME_TYPE,
    "PNG": PNG_MIME_TYPE,
    "WEBP": WEBP_MIME_TYPE,
}

IMAGE_MIME_TO_EXTENSION = {
    JPEG_MIME_TYPE: ".jpg",
    PNG_MIME_TYPE: ".png",
    WEBP_MIME_TYPE: ".webp",
}

ALLOWED_IMAGE_MIME_TYPES = frozenset(IMAGE_MIME_TO_EXTENSION)

_IMAGE_VALIDATION_LIMITER = anyio.CapacityLimiter(1)


async def validate_manual_image(
    image: UploadFile,
    *,
    batch: AssetWriteBatch,
) -> ValidatedManualImage:
    """Copia, cierra y valida una imagen subida sin materializar sus bytes."""
    staged: StagedAsset | None = None
    try:
        if image.size is not None and image.size > config.MAX_IMAGE_SIZE:
            raise ImageTooLargeError
        if image.content_type not in ALLOWED_IMAGE_MIME_TYPES:
            raise InvalidImageError
        try:
            staged = await batch.stage(image.file, max_bytes=config.MAX_IMAGE_SIZE)
        except AssetSizeExceededError:
            raise ImageTooLargeError from None
    finally:
        with anyio.CancelScope(shield=True):
            await image.close()

    try:
        return await anyio.to_thread.run_sync(
            _validate_manual_image_path,
            staged,
            image.content_type,
            limiter=_IMAGE_VALIDATION_LIMITER,
        )
    except BaseException:
        with anyio.CancelScope(shield=True):
            with suppress(OSError):
                await _discard_staged(staged)
        raise


async def validate_manual_pdf(
    pdf: UploadFile,
    *,
    batch: AssetWriteBatch,
) -> ValidatedManualPdf:
    """Copia, cierra y valida un PDF mediante PDFium directamente por ruta."""
    staged: StagedAsset | None = None
    try:
        if pdf.size is not None and pdf.size > config.MAX_MANUAL_PDF_SIZE:
            raise PdfTooLargeError
        if pdf.content_type != PDF_MIME_TYPE:
            raise InvalidPdfError
        try:
            staged = await batch.stage(pdf.file, max_bytes=config.MAX_MANUAL_PDF_SIZE)
        except AssetSizeExceededError:
            raise PdfTooLargeError from None
    finally:
        with anyio.CancelScope(shield=True):
            await pdf.close()

    try:
        return await run_pdfium(
            _validate_manual_pdf_path,
            staged,
            pdf.content_type,
        )
    except BaseException:
        with anyio.CancelScope(shield=True):
            with suppress(OSError):
                await _discard_staged(staged)
        raise


def _validate_manual_image_path(
    staged: StagedAsset,
    declared_mime_type: str | None,
) -> ValidatedManualImage:
    """Ejecuta la decodificación completa de Pillow sobre un fichero local."""
    if declared_mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise InvalidImageError

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(staged.path) as candidate:
                candidate.verify()
            with Image.open(staged.path) as decoded:
                image_format = decoded.format
                if image_format not in IMAGE_FORMAT_TO_MIME:
                    raise InvalidImageError
                mime_type = IMAGE_FORMAT_TO_MIME[image_format]
                width, height = decoded.size
                frame_count = getattr(decoded, "n_frames", 1)
                is_animated = bool(getattr(decoded, "is_animated", False))
                if (
                    width <= 0
                    or height <= 0
                    or width * height > config.MAX_IMAGE_PIXELS
                    or frame_count != 1
                    or is_animated
                ):
                    raise InvalidImageError
                decoded.load()
    except InvalidImageError:
        raise
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        KeyError,
        OSError,
        SyntaxError,
        ValueError,
    ):
        raise InvalidImageError from None

    if mime_type != declared_mime_type:
        raise InvalidImageError

    return ValidatedManualImage(
        path=staged.path,
        byte_size=staged.byte_size,
        mime_type=mime_type,
        extension=IMAGE_MIME_TO_EXTENSION[mime_type],
        width=width,
        height=height,
        sha256=staged.sha256,
    )


def _validate_manual_pdf_path(
    staged: StagedAsset,
    declared_mime_type: str | None,
) -> ValidatedManualPdf:
    """Comprueba firma y estructura PDF sin leer el fichero completo en Python."""
    if declared_mime_type != PDF_MIME_TYPE:
        raise InvalidPdfError
    try:
        with staged.path.open("rb") as source:
            if source.read(len(PDF_SIGNATURE)) != PDF_SIGNATURE:
                raise InvalidPdfError
        with pdfium.PdfDocument(staged.path) as document:
            if pdfium_c.FPDF_GetSecurityHandlerRevision(document.raw) != -1:
                raise InvalidPdfError
            page_count = len(document)
    except InvalidPdfError:
        raise
    except (pdfium.PdfiumError, OSError, ValueError):
        raise InvalidPdfError from None

    if page_count <= 0:
        raise InvalidPdfError
    if page_count > config.MAX_MANUAL_PAGES:
        raise ManualPageLimitExceededError

    return ValidatedManualPdf(
        path=staged.path,
        byte_size=staged.byte_size,
        mime_type=PDF_MIME_TYPE,
        extension=PDF_EXTENSION,
        page_count=page_count,
        sha256=staged.sha256,
    )


async def _discard_staged(staged: StagedAsset) -> None:
    """Limpia el temporal concreto cuando falla su validación."""
    await anyio.to_thread.run_sync(_unlink_if_present, staged.path)


def _unlink_if_present(path: Path) -> None:
    """Borra una ruta staged; helper posicional para ``run_sync``."""
    path.unlink(missing_ok=True)
