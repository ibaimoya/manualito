import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from llm.main import app, lifespan


def test_lifespan_starts_checks_model_and_closes_http_client():
    """El arranque del LLM prepara el cliente y verifica el modelo configurado."""
    start = AsyncMock()
    close = AsyncMock()
    prepare_model_on_startup = AsyncMock()
    shared_client = MagicMock()

    async def run_lifespan():
        async with lifespan(app):
            start.assert_awaited_once_with()
            prepare_model_on_startup.assert_awaited_once_with(shared_client)
            close.assert_not_awaited()

    with (
        patch("llm.main.dependencies.start_http_client", start),
        patch("llm.main.dependencies.close_http_client", close),
        patch("llm.main.dependencies.get_http_client", return_value=shared_client),
        patch("llm.main.prepare_model_on_startup", prepare_model_on_startup),
    ):
        asyncio.run(run_lifespan())

    close.assert_awaited_once_with()
