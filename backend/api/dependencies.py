import httpx

from common.http_client import HttpClientState

_http_client_state = HttpClientState()


async def start_http_client() -> None:
    """
    Inicializa el cliente HTTP compartido del gateway.

    El cliente se crea una vez por proceso para reutilizar conexiones hacia los
    servicios internos OCR/RAG/LLM en vez de abrir un socket por request.
    """
    await _http_client_state.start()


async def close_http_client() -> None:
    """Cierra el cliente HTTP compartido al detener el proceso."""
    await _http_client_state.close()


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    return _http_client_state.get_client()
