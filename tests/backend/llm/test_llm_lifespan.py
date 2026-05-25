import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from llm.main import app, lifespan


def test_lifespan_starts_checks_model_and_closes_http_client():
    """El arranque del LLM prepara el cliente y verifica el modelo configurado."""
    start = AsyncMock()
    close = AsyncMock()
    warn_if_model_missing = AsyncMock()
    shared_client = MagicMock()

    async def run_lifespan():
        async with lifespan(app):
            start.assert_awaited_once_with()
            warn_if_model_missing.assert_awaited_once_with(shared_client)
            close.assert_not_awaited()

    with (
        patch("llm.main.dependencies.start_http_client", start),
        patch("llm.main.dependencies.close_http_client", close),
        patch("llm.main.dependencies.get_http_client", return_value=shared_client),
        patch("llm.main.warn_if_model_missing", warn_if_model_missing),
    ):
        asyncio.run(run_lifespan())

    close.assert_awaited_once_with()
