import httpx

_http_client: httpx.AsyncClient | None = None


async def start_http_client() -> None:
    """
    Inicializa el cliente HTTP compartido del gateway.

    El cliente se crea una vez por proceso para reutilizar conexiones hacia los
    servicios internos OCR/RAG/LLM en vez de abrir un socket por request.
    """
    global _http_client
    _http_client = httpx.AsyncClient()


async def close_http_client() -> None:
    """Cierra el cliente HTTP compartido al detener el proceso."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
    _http_client = None


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    if _http_client is None:
        raise RuntimeError("El cliente HTTP aún no se ha inicializado.")
    return _http_client
