import os


def _bool_env(name: str, *, default: bool) -> bool:
    """Lee un booleano de entorno con fallo explícito ante valores ambiguos."""
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} debe ser un booleano válido.")


def _int_env(name: str, *, default: int, minimum: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise ValueError(f"{name} debe ser un entero valido.") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} debe ser mayor o igual que {minimum}.")
    return value


OLLAMA_URL = os.environ["OLLAMA_URL"]
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "granite3.3:2b")
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE")
OLLAMA_PRELOAD_ON_STARTUP = _bool_env("OLLAMA_PRELOAD_ON_STARTUP", default=False)
OLLAMA_TIMEOUT = 120.0
OLLAMA_STARTUP_CHECK_TIMEOUT = 10.0
OLLAMA_PRELOAD_TIMEOUT = 180.0
OLLAMA_TEMPERATURE = 0.2
OLLAMA_NUM_CTX = _int_env("OLLAMA_NUM_CTX", default=8192, minimum=1024)
