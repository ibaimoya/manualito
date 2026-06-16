import logging

from paddleocr import PaddleOCR

from ocr.engines.common import OcrLine, log_ocr_result
from ocr.engines.paddle.common import normalize_paddle_result
from ocr.engines.paddle.preprocessing import preprocess_for_paddle
from ocr.engines.preprocessing import preprocessed_image_path

logger = logging.getLogger(__name__)


class PaddleCpuOcrEngine:
    """Motor OCR actual, basado en PaddleOCR con configuración CPU."""

    name = "paddle_cpu"

    def __init__(self):
        """Inicializa PaddleOCR con la configuración histórica del servicio."""
        self._ocr = PaddleOCR(
            use_textline_orientation=True,
            lang="es",
            enable_mkldnn=False,
            device="cpu",
        )
        logger.info("PaddleOCR CPU inicializado correctamente.")

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """Extrae líneas OCR normalizadas con PaddleOCR CPU."""
        logger.info("Iniciando OCR sobre: %s", image_path)
        with preprocessed_image_path(image_path, preprocess_for_paddle) as processed_path:
            lines = normalize_paddle_result(self._ocr.predict(processed_path))
        log_ocr_result(logger, image_path, lines)
        return lines
