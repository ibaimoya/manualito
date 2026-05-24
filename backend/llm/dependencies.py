import httpx

from llm import config

_http_client: httpx.AsyncClient | None = None


async def start_http_client() -> None:
    """Inicializa el cliente HTTP compartido hacia Ollama."""
    global _http_client
    _http_client = httpx.AsyncClient(timeout=config.OLLAMA_TIMEOUT)


async def close_http_client() -> None:
    """Cierra el cliente HTTP compartido al detener el servicio."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
    _http_client = None


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    if _http_client is None:  # Solo ocurre si alguien llama al endpoint sin lifespan.
        raise RuntimeError("El cliente HTTP aún no se ha inicializado.")
    return _http_client
