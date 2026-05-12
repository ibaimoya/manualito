import logging
import os
from collections.abc import Callable

from contracts import OcrEngine

logger = logging.getLogger(__name__)

DEFAULT_OCR_ENGINE = "paddle_cpu"


def _create_paddle_cpu_engine() -> OcrEngine:
    """
    Crea el motor OCR actual.

    El import se hace aquí para que la factory no cargue dependencias de
    PaddleOCR cuando en el futuro se seleccione otro motor, como Tesseract.
    """
    from engines.paddle.cpu import PaddleCpuOcrEngine

    return PaddleCpuOcrEngine()


def _create_paddle_gpu_engine() -> OcrEngine:
    """
    Crea el motor OCR acelerado por GPU.

    El import se mantiene perezoso para no exigir PaddlePaddle GPU cuando el
    despliegue está usando el motor CPU o, en el futuro, Tesseract.
    """
    from engines.paddle.gpu import PaddleGpuOcrEngine

    return PaddleGpuOcrEngine()


# Diccionario de motores OCR disponibles: nombre de configuración -> función creadora.
SUPPORTED_OCR_ENGINES: dict[str, Callable[[], OcrEngine]] = {
    "paddle_cpu": _create_paddle_cpu_engine,
    "paddle_gpu": _create_paddle_gpu_engine,
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
    selected_engine = (selected_engine or "").strip().lower() or DEFAULT_OCR_ENGINE

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
