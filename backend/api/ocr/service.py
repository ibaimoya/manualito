"""Casos de uso de OCR expuestos por el gateway API."""

import logging

import httpx
from fastapi import UploadFile

from api import client as internal_client
from api import config
from api.manuals.validation import ValidatedManualImage, validate_manual_image
from common.logging import safe_for_log
from common.ocr.postprocessing import OcrPostprocessConfig, postprocess_ocr_lines

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
    lines = await internal_client.call_ocr_service(
        client=client,
        filename=filename,
        content=image.content,
        content_type=image.mime_type,
    )
    return postprocess_ocr_lines(lines, config=_postprocess_config())


def _postprocess_config() -> OcrPostprocessConfig:
    return OcrPostprocessConfig(
        low_confidence_line=config.OCR_POSTPROCESS_LOW_CONFIDENCE_LINE,
        short_text_max_alnum=config.OCR_POSTPROCESS_SHORT_TEXT_MAX_ALNUM,
        very_short_text_max_chars=config.OCR_POSTPROCESS_VERY_SHORT_TEXT_MAX_CHARS,
        symbol_noise_ratio=config.OCR_POSTPROCESS_SYMBOL_NOISE_RATIO,
        min_alnum_to_keep=config.OCR_POSTPROCESS_MIN_ALNUM_TO_KEEP,
    )
