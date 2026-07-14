"""Casos de uso de OCR expuestos por el gateway API."""

import logging
import shutil
import tempfile
from pathlib import Path
from uuid import UUID

import anyio
import httpx
from fastapi import UploadFile

from api import client as internal_client
from api import config
from api.assets.storage import LocalAssetStore
from api.manuals.dto import ValidatedManualImage
from api.manuals.exceptions import AssetStorageUnavailableError
from api.manuals.validation import validate_manual_image
from common.ocr.postprocessing import OcrPostprocessConfig, postprocess_ocr_lines

logger = logging.getLogger(__name__)


async def extract_ocr_lines(
    *,
    image: UploadFile,
    client: httpx.AsyncClient,
) -> list[dict[str, object]]:
    """Valida una imagen subida y delega su extracción en el servicio OCR."""
    staging_root: Path | None = None
    try:
        staging_root = await anyio.to_thread.run_sync(_create_staging_root)
        batch = await LocalAssetStore(staging_root).create_manual_batch(owner_user_id=UUID(int=0))
        validated = await validate_manual_image(image, batch=batch)
        return await run_ocr(image=validated, client=client)
    except OSError as exc:
        raise AssetStorageUnavailableError from exc
    finally:
        with anyio.CancelScope(shield=True):
            if staging_root is not None:
                await anyio.to_thread.run_sync(shutil.rmtree, staging_root, True)


async def run_ocr(
    *,
    image: ValidatedManualImage,
    client: httpx.AsyncClient,
) -> list[dict[str, object]]:
    """Delega en OCR una imagen que API ya ha validado."""
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


def _create_staging_root() -> Path:
    """Crea una raíz efímera dentro del TMPDIR operativo del proceso."""
    return Path(tempfile.mkdtemp(prefix="manualito_gateway_ocr_"))


def _postprocess_config() -> OcrPostprocessConfig:
    return OcrPostprocessConfig(
        low_confidence_line=config.OCR_POSTPROCESS_LOW_CONFIDENCE_LINE,
        short_text_max_alnum=config.OCR_POSTPROCESS_SHORT_TEXT_MAX_ALNUM,
        very_short_text_max_chars=config.OCR_POSTPROCESS_VERY_SHORT_TEXT_MAX_CHARS,
        symbol_noise_ratio=config.OCR_POSTPROCESS_SYMBOL_NOISE_RATIO,
        min_alnum_to_keep=config.OCR_POSTPROCESS_MIN_ALNUM_TO_KEEP,
    )
