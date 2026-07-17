"""Integración OCR del procesamiento asíncrono de manuales."""

import logging

import httpx

from api import client as internal_client
from api import config
from api.manuals.dto import ValidatedManualImage
from common.ocr.postprocessing import OcrPostprocessConfig, postprocess_ocr_lines

logger = logging.getLogger(__name__)


async def run_ocr(
    *,
    image: ValidatedManualImage,
    client: httpx.AsyncClient,
) -> list[dict[str, object]]:
    """Procesa mediante OCR privado una imagen de manual ya validada."""
    logger.info(
        "Petición OCR recibida: %s (%d bytes)",
        image.mime_type,
        image.byte_size,
    )
    lines = await internal_client.call_ocr_service(
        client=client,
        image_path=image.path,
        byte_size=image.byte_size,
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
