import logging

from contracts import OcrLine
from paddleocr import PaddleOCR

from engines.common import log_ocr_result
from engines.paddle.common import normalize_paddle_result

logger = logging.getLogger(__name__)


class PaddleCpuOcrEngine:
    """Motor OCR actual, basado en PaddleOCR con configuración CPU."""

    name = "paddle_cpu"

    def __init__(self):
        """Inicializa PaddleOCR con la configuración histórica del servicio."""
        try:
            self._ocr = PaddleOCR(
                use_textline_orientation=True,
                lang="es",
                enable_mkldnn=False,
                device="cpu",
            )
            logger.info("PaddleOCR CPU inicializado correctamente.")
        except Exception:
            logger.exception("Error al inicializar PaddleOCR CPU.")
            raise

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """
        Extrae las líneas de texto reconocidas en una imagen.

        Procesa la imagen indicada mediante PaddleOCR CPU y transforma
        su salida interna en una lista normalizada de líneas con confianza
        redondeada a cuatro decimales.
        """
        logger.info("Iniciando OCR sobre: %s", image_path)
        lines = normalize_paddle_result(self._ocr.predict(image_path))
        log_ocr_result(logger, image_path, lines)
        return lines
