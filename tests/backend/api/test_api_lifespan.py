import asyncio
from unittest.mock import AsyncMock, patch

from api.main import app, lifespan


def test_lifespan_starts_and_closes_shared_http_client():
    """El ciclo de vida de la API abre y cierra el cliente HTTP compartido."""
    start = AsyncMock()
    close = AsyncMock()

    async def run_lifespan():
        async with lifespan(app):
            start.assert_awaited_once_with()
            close.assert_not_awaited()

    with (
        patch("api.main.dependencies.start_http_client", start),
        patch("api.main.dependencies.close_http_client", close),
    ):
        asyncio.run(run_lifespan())

    close.assert_awaited_once_with()
