import logging

from contracts import OcrLine
from paddleocr import PaddleOCR

from engines.common import log_ocr_result
from engines.paddle.common import normalize_paddle_result

logger = logging.getLogger(__name__)


class PaddleGpuOcrEngine:
    """Motor OCR acelerado por GPU, basado en PaddleOCR con CUDA."""

    name = "paddle_gpu"

    def __init__(self):
        """Inicializa PaddleOCR tras comprobar que Paddle ve CUDA y una GPU."""
        try:
            self._ensure_cuda_available()
            self._ocr = PaddleOCR(
                use_textline_orientation=True,
                lang="es",
                device="gpu",
            )
            logger.info("PaddleOCR GPU inicializado correctamente.")
        except Exception:
            logger.error("Error al inicializar PaddleOCR GPU.", exc_info=True)
            raise

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """
        Extrae las líneas de texto reconocidas en una imagen.

        Procesa la imagen indicada mediante PaddleOCR GPU y transforma
        su salida interna en una lista normalizada de líneas con confianza
        redondeada a cuatro decimales.
        """
        logger.info("Iniciando OCR sobre: %s", image_path)
        lines = normalize_paddle_result(self._ocr.predict(image_path))
        log_ocr_result(logger, image_path, lines)
        return lines

    @staticmethod
    def _ensure_cuda_available() -> None:
        """Falla pronto si PaddlePaddle no tiene CUDA real disponible."""
        import paddle

        if not paddle.is_compiled_with_cuda():
            raise RuntimeError(
                "PaddlePaddle no está instalado con soporte CUDA. "
                "Usa la imagen OCR GPU cu118 o cambia OCR_ENGINE=paddle_cpu."
            )

        if paddle.device.cuda.device_count() < 1:
            raise RuntimeError(
                "No se ha detectado ninguna GPU CUDA disponible para PaddleOCR."
            )
