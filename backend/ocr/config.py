import os

PADDLE_CPU = "paddle_cpu"
PADDLE_GPU = "paddle_gpu"
TESSERACT = "tesseract"

DEFAULT_OCR_ENGINE = TESSERACT


def _positive_int_env(name: str, default: int) -> int:
    """Lee un entero positivo desde entorno o usa el valor por defecto."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    value = int(raw)
    if value < 1:
        raise ValueError(f"{name} debe ser mayor o igual que 1.")
    return value


OCR_MAX_CONCURRENCY = _positive_int_env("OCR_MAX_CONCURRENCY", 1)
