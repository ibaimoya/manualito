import logging
import os
import tempfile
import uuid
from contextlib import suppress

import anyio
from fastapi import UploadFile

from common.logging import safe_for_log
from ocr import config
from ocr.exceptions import OcrProcessingError
from ocr.extractor import extract_text

logger = logging.getLogger(__name__)
_ocr_limiter = anyio.CapacityLimiter(config.OCR_MAX_CONCURRENCY)


async def extract_image_text(image: UploadFile) -> dict:
    """Guarda la imagen temporalmente y ejecuta el OCR configurado."""
    data = await image.read()
    logger.info(
        "Petición OCR recibida: %s (%d bytes)",
        safe_for_log(image.filename),
        len(data),
    )

    tmp_path = os.path.join(
        tempfile.gettempdir(),
        f"manualito_ocr_{uuid.uuid4().hex}.jpg",
    )
    try:
        async with await anyio.open_file(tmp_path, "wb") as tmp:
            await tmp.write(data)
        lines = await anyio.to_thread.run_sync(extract_text, tmp_path, limiter=_ocr_limiter)
    except (OSError, RuntimeError, ValueError, KeyError, TypeError, IndexError) as ocr_err:
        logger.exception(
            "Error durante el OCR de '%s'.",
            safe_for_log(image.filename),
        )
        raise OcrProcessingError from ocr_err
    finally:
        if os.path.exists(tmp_path):
            with suppress(OSError):
                os.remove(tmp_path)

    return {"lines": lines}
