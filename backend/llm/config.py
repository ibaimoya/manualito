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


OLLAMA_URL = os.environ["OLLAMA_URL"]
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi4:14b")
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE")
OLLAMA_PRELOAD_ON_STARTUP = _bool_env("OLLAMA_PRELOAD_ON_STARTUP", default=False)
OLLAMA_TIMEOUT = 120.0
OLLAMA_STARTUP_CHECK_TIMEOUT = 10.0
OLLAMA_PRELOAD_TIMEOUT = 180.0
OLLAMA_TEMPERATURE = 0.2
OLLAMA_NUM_CTX = 8192
