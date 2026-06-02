"""Casos de uso de OCR expuestos por el gateway API."""

import logging

import httpx
from fastapi import UploadFile

from api import client as internal_client
from api.manuals.validation import ValidatedManualImage, validate_manual_image
from common.logging import safe_for_log

logger = logging.getLogger(__name__)


async def extract_ocr_lines(
    *,
    image: UploadFile,
    client: httpx.AsyncClient,
) -> list[dict]:
    """Valida una imagen subida y delega su extracción en el servicio OCR."""
    validated = await validate_manual_image(image)
    return await run_ocr(filename=image.filename, image=validated, client=client)


async def run_ocr(
    *,
    filename: str | None,
    image: ValidatedManualImage,
    client: httpx.AsyncClient,
) -> list[dict]:
    """Delega en OCR una imagen que API ya ha validado."""
    logger.info(
        "Petición OCR recibida: %s (%d bytes)",
        safe_for_log(filename),
        len(image.content),
    )
    return await internal_client.call_ocr_service(
        client=client,
        filename=filename,
        content=image.content,
        content_type=image.mime_type,
    )
