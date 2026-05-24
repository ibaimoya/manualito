import logging
import os
import tempfile
import uuid

import anyio
from fastapi import UploadFile

from common.logging import safe_for_log
from ocr.exceptions import OcrProcessingError
from ocr.extractor import extract_text

logger = logging.getLogger(__name__)


async def extract_image_text(image: UploadFile) -> dict:
    """
    Extrae el texto de una imagen mediante OCR.

    Recibe los bytes de una imagen, los persiste temporalmente en disco
    (PaddleOCR requiere ruta de fichero) y devuelve las líneas reconocidas.
    """
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
        lines = extract_text(tmp_path)
    except Exception as ocr_err:
        logger.exception(
            "Error durante el OCR de '%s'.",
            safe_for_log(image.filename),
        )
        raise OcrProcessingError from ocr_err
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return {"lines": lines}
