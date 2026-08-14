from typing import Annotated

import httpx
from fastapi import Header

from common.http_client import HttpClientState
from common.language import Language

_http_client_state = HttpClientState(timeout=None)


async def start_http_client() -> None:
    """Inicializa el cliente HTTP compartido para reutilizar conexiones internas."""
    await _http_client_state.start()


async def close_http_client() -> None:
    """Cierra el cliente HTTP compartido al detener el proceso."""
    await _http_client_state.close()


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    return _http_client_state.get_client()


async def get_accept_language(
    *,
    accept_language: Annotated[str | None, Header()] = None,
) -> Language | None:
    """Valida el idioma admitido por el gateway sin rechazar otros valores."""
    if accept_language == "es":
        return "es"
    if accept_language == "en":
        return "en"
    return None
