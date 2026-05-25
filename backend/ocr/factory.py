import logging
import os
from collections.abc import Callable

from ocr import config
from ocr.engines.common import OcrEngine

logger = logging.getLogger(__name__)


def _create_tesseract_engine() -> OcrEngine:
    """
    Crea el motor OCR basado en Tesseract (motor por defecto).

    El import se hace de forma perezosa para no cargar pytesseract cuando se
    selecciona un motor Paddle.
    """
    from ocr.engines.tesseract import TesseractOcrEngine

    return TesseractOcrEngine()


def _create_paddle_cpu_engine() -> OcrEngine:
    """
    Crea el motor OCR basado en PaddleOCR sobre CPU.

    El import se hace de forma perezosa para no cargar dependencias de
    PaddleOCR cuando se selecciona Tesseract o la variante GPU.
    """
    from ocr.engines.paddle.cpu import PaddleCpuOcrEngine

    return PaddleCpuOcrEngine()


def _create_paddle_gpu_engine() -> OcrEngine:
    """
    Crea el motor OCR basado en PaddleOCR acelerado por GPU.

    El import se mantiene perezoso para no exigir PaddlePaddle GPU cuando se
    selecciona Tesseract o la variante CPU.
    """
    from ocr.engines.paddle.gpu import PaddleGpuOcrEngine

    return PaddleGpuOcrEngine()


# Diccionario de motores OCR disponibles: nombre de configuración -> función creadora.
SUPPORTED_OCR_ENGINES: dict[str, Callable[[], OcrEngine]] = {
    config.TESSERACT: _create_tesseract_engine,
    config.PADDLE_CPU: _create_paddle_cpu_engine,
    config.PADDLE_GPU: _create_paddle_gpu_engine,
}


def create_ocr_engine(engine_name: str | None = None) -> OcrEngine:
    """
    Crea el motor OCR solicitado.

    Si no se pasa `engine_name`, se usa la variable de entorno `OCR_ENGINE`.
    Si tampoco existe o está vacía, se usa el motor por defecto.
    """
    selected_engine = (
        engine_name if engine_name is not None else os.getenv("OCR_ENGINE")
    )
    selected_engine = (
        selected_engine or ""
    ).strip().lower() or config.DEFAULT_OCR_ENGINE

    try:
        engine_factory = SUPPORTED_OCR_ENGINES[selected_engine]
    except KeyError as exc:
        supported = ", ".join(sorted(SUPPORTED_OCR_ENGINES))
        raise ValueError(
            f"Motor OCR no soportado: {selected_engine!r}. "
            f"Motores soportados: {supported}."
        ) from exc

    logger.info("Motor OCR seleccionado: %s", selected_engine)
    return engine_factory()
