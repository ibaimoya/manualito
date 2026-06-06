import logging

import pytesseract
from pytesseract import Output

from ocr.engines.common import OcrLine, log_ocr_result
from ocr.engines.tesseract.normalizer import normalize_tesseract_result

logger = logging.getLogger(__name__)

TESSERACT_TIMEOUT_SECONDS = 120


class TesseractOcrEngine:
    """Motor OCR basado en Tesseract con datos de idioma español."""

    name = "tesseract"

    def __init__(self, lang: str = "spa"):
        """Inicializa Tesseract y comprueba que el binario e idioma existen."""
        self._lang = lang
        version = pytesseract.get_tesseract_version()
        self._ensure_language_available()
        logger.info("Tesseract inicializado correctamente: %s.", version)

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """Extrae líneas OCR normalizadas con Tesseract."""
        logger.info("Iniciando OCR sobre: %s", image_path)
        result = pytesseract.image_to_data(
            image_path,
            lang=self._lang,
            output_type=Output.DICT,
            timeout=TESSERACT_TIMEOUT_SECONDS,
        )
        lines = normalize_tesseract_result(result)
        log_ocr_result(logger, image_path, lines)
        return lines

    def _ensure_language_available(self) -> None:
        """Falla pronto si Tesseract no tiene instalado el idioma configurado."""
        languages = pytesseract.get_languages(config="")
        if self._lang not in languages:
            raise RuntimeError(f"Tesseract no tiene instalado el pack de idioma {self._lang!r}.")
