import asyncio

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


def test_get_http_client_raises_before_startup():
    """Sin lifespan activo, la dependencia falla de forma explícita."""
    with pytest.raises(RuntimeError, match="no se ha inicializado"):
        dependencies.get_http_client()
