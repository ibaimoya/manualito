import asyncio
from unittest.mock import MagicMock, patch

from rag.main import app, lifespan


def test_lifespan_warms_embedding_model_and_repository_before_serving():
    """El arranque RAG precarga embeddings y ChromaDB antes de aceptar tráfico."""
    embedding_service = MagicMock()
    repository = MagicMock()

    async def run_lifespan():
        async with lifespan(app):
            embedding_service.warm_up.assert_called_once_with()
            repository.warm_up.assert_called_once_with()

    with (
        patch("rag.main.get_embedding_service", return_value=embedding_service),
        patch("rag.main.get_repository", return_value=repository),
    ):
        asyncio.run(run_lifespan())
