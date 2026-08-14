import asyncio
from functools import partial

import anyio
import httpx
import pytest

import api.dependencies as dependencies


@pytest.fixture(autouse=True)
def reset_http_client_state():
    """Cada test empieza con el cliente compartido detenido."""
    asyncio.run(dependencies.close_http_client())
    try:
        yield
    finally:
        asyncio.run(dependencies.close_http_client())


def test_http_client_lifecycle_exposes_shared_async_client():
    """El cliente HTTP del gateway se crea una vez y se expone a FastAPI."""
    asyncio.run(dependencies.start_http_client())

    client = dependencies.get_http_client()

    assert isinstance(client, httpx.AsyncClient)
    assert dependencies.get_http_client() is client


def test_http_client_delega_el_limite_de_tiempo_en_cada_llamada():
    """El cliente compartido no impone timeout propio: el presupuesto lo pone send_request."""
    asyncio.run(dependencies.start_http_client())

    assert dependencies.get_http_client().timeout == httpx.Timeout(None)


def test_get_http_client_raises_before_startup():
    """Sin lifespan activo, la dependencia falla de forma explícita."""
    with pytest.raises(RuntimeError, match="no se ha inicializado"):
        dependencies.get_http_client()


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, None),
        ("es", "es"),
        ("en", "en"),
        ("ES", None),
        ("en-US", None),
        ("es-ES,en;q=0.9", None),
        ("fr", None),
        ("", None),
    ],
)
def test_accept_language_dependency_validates_supported_values(header, expected):
    """La dependencia solo admite los dos valores cerrados del contrato."""
    result = anyio.run(
        partial(dependencies.get_accept_language, accept_language=header)
    )

    assert result == expected
