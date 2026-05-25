import httpx

from common.http_client import HttpClientState
from llm import config

_http_client_state = HttpClientState(timeout=config.OLLAMA_TIMEOUT)


async def start_http_client() -> None:
    """Inicializa el cliente HTTP compartido hacia Ollama."""
    await _http_client_state.start()


async def close_http_client() -> None:
    """Cierra el cliente HTTP compartido al detener el servicio."""
    await _http_client_state.close()


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    return _http_client_state.get_client()
