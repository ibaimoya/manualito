import asyncio

import pytest

from common.http_client import HttpClientState


def test_get_raises_before_client_is_started():
    """Sin lifespan activo, el cliente HTTP falla de forma explícita."""
    state = HttpClientState()

    with pytest.raises(RuntimeError, match="no se ha inicializado"):
        state.get_client()


def test_start_exposes_shared_http_client():
    """El cliente inicializado queda disponible hasta que se cierre."""
    state = HttpClientState()

    async def scenario():
        await state.start()
        try:
            client = state.get_client()
            assert client.is_closed is False
        finally:
            await state.close()

    asyncio.run(scenario())


def test_close_resets_client_state():
    """Tras cerrar el cliente, la dependencia vuelve a fallar explícitamente."""
    state = HttpClientState()

    async def scenario():
        await state.start()
        await state.close()

    asyncio.run(scenario())

    with pytest.raises(RuntimeError, match="no se ha inicializado"):
        state.get_client()


def test_client_options_are_forwarded_to_httpx():
    """Las opciones específicas de cada servicio llegan al AsyncClient."""
    state = HttpClientState(timeout=1.5)

    async def scenario():
        await state.start()
        try:
            assert state.get_client().timeout.connect == 1.5
        finally:
            await state.close()

    asyncio.run(scenario())


def test_double_start_closes_previous_client():
    """start() dos veces seguidas cierra el cliente anterior para no fugar sockets."""
    state = HttpClientState()

    async def scenario():
        await state.start()
        first_client = state.get_client()
        try:
            await state.start()
            assert first_client.is_closed is True
            assert state.get_client() is not first_client
        finally:
            await state.close()

    asyncio.run(scenario())


def test_close_without_start_is_idempotent():
    """close() sin start() previo no debe lanzar y debe poder repetirse."""
    state = HttpClientState()

    async def scenario():
        await state.close()
        await state.close()

    asyncio.run(scenario())
