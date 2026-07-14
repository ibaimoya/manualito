import logging
import os
import tempfile
from contextlib import suppress

import anyio
from fastapi import Request

from ocr import config
from ocr.exceptions import (
    OcrContentLengthMismatchError,
    OcrImageTooLargeError,
    OcrProcessingError,
    OcrUnsupportedMediaTypeError,
)
from ocr.extractor import extract_text
from ocr.schemas import ExtractResponse, OCRLine

logger = logging.getLogger(__name__)
_ocr_limiter = anyio.CapacityLimiter(config.OCR_MAX_CONCURRENCY)
_SUPPORTED_IMAGE_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


async def extract_image_text(
    request: Request,
    *,
    content_type: str,
    declared_size: int,
) -> ExtractResponse:
    """Persiste el cuerpo binario por bloques y ejecuta el OCR configurado."""
    if content_type not in _SUPPORTED_IMAGE_CONTENT_TYPES:
        raise OcrUnsupportedMediaTypeError
    if declared_size > config.OCR_MAX_IMAGE_SIZE:
        raise OcrImageTooLargeError
    async with _ocr_limiter:
        return await _extract_image_text_limited(
            request,
            content_type=content_type,
            declared_size=declared_size,
        )


async def _extract_image_text_limited(
    request: Request,
    *,
    content_type: str,
    declared_size: int,
) -> ExtractResponse:
    """Mantiene ocupado el cupo desde el primer byte hasta terminar OCR."""
    try:
        tmp_path = await anyio.to_thread.run_sync(_new_temp_path)
    except OSError as temp_err:
        logger.exception("No se pudo crear el temporal de OCR.")
        raise OcrProcessingError from temp_err
    received_size = 0
    try:
        tmp = await anyio.open_file(tmp_path, "wb")
        try:
            async for chunk in request.stream():
                received_size += len(chunk)
                if received_size > config.OCR_MAX_IMAGE_SIZE:
                    raise OcrImageTooLargeError
                await tmp.write(chunk)
        finally:
            with anyio.CancelScope(shield=True):
                await tmp.aclose()
        if received_size != declared_size:
            raise OcrContentLengthMismatchError
        logger.info(
            "Petición OCR interna recibida: %s (%d bytes)",
            content_type,
            declared_size,
        )
        lines = await anyio.to_thread.run_sync(extract_text, tmp_path)
    except (OSError, RuntimeError, ValueError, KeyError, TypeError, IndexError) as ocr_err:
        logger.exception("Error durante el OCR interno.")
        raise OcrProcessingError from ocr_err
    finally:
        with anyio.CancelScope(shield=True):
            with suppress(OSError):
                await anyio.to_thread.run_sync(os.remove, tmp_path)

    return ExtractResponse(
        lines=[OCRLine(text=line["text"], confidence=line["confidence"]) for line in lines]
    )


def _new_temp_path() -> str:
    descriptor, path = tempfile.mkstemp(prefix="manualito_ocr_", suffix=".image")
    os.close(descriptor)
    return path
