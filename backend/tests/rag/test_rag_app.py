import logging
from datetime import datetime
from unittest.mock import MagicMock, patch

import anyio
import pytest
from pydantic import ValidationError

from rag.annotations import RAG_RETRIEVAL_TOP_K_MAX
from rag.embeddings import EMBEDDING_MODEL
from rag.exceptions import ContextNotFoundError, RagIndexingError
from rag.schemas import IngestRequest, RetrieveRequest
from rag.service import ingest_manual

_MANUAL_ID = "manual-1"
_GAME_ID = "game-1"
_OWNER_USER_ID = "user-1"
_CONTENT_HASH = "a" * 64


def _ingest_payload(*, manual_id: str = _MANUAL_ID) -> dict:
    """Construye una petición de ingesta con chunks ya persistidos."""
    return {
        "manual_id": manual_id,
        "game_id": _GAME_ID,
        "owner_user_id": _OWNER_USER_ID,
        "language": "es",
        "chunks": [
            {
                "id": "chunk-1",
                "text": "Regla uno.",
                "chunk_index": 0,
                "source_page": 1,
                "content_hash": _CONTENT_HASH,
            }
        ],
    }


def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — ingesta de chunks preparados
#   Clase 1: Chunks válidos — indexación correcta.
#   Clase 2: Payload sin chunks — 422 por contrato Pydantic.
#   Clase 3: Falla la vectorización o la persistencia — 500.
# ---------------------------------------------------------------------------
def test_ingest_indexes_prepared_chunks(client):
    """Una ingesta válida indexa exactamente los chunks enviados por API."""
    embedding_service = MagicMock()
    embedding_service.embed_passages.return_value = [[0.1, 0.2]]
    repository = MagicMock()
    repository.upsert_manual.return_value = 1

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
    ):
        response = client.post("/ingest", json=_ingest_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["manual_id"] == _MANUAL_ID
    assert body["chunks_indexed"] == 1
    assert body["status"] == "indexed"
    assert body["embedding_model"] == EMBEDDING_MODEL
    assert body["chunk_ids"] == ["chunk-1"]
    datetime.fromisoformat(body["indexed_at"])

    embedding_service.embed_passages.assert_called_once_with(["Regla uno."])
    repository.upsert_manual.assert_called_once()
    kwargs = repository.upsert_manual.call_args.kwargs
    assert kwargs["manual_id"] == _MANUAL_ID
    assert kwargs["game_id"] == _GAME_ID
    assert kwargs["owner_user_id"] == _OWNER_USER_ID
    assert kwargs["language"] == "es"
    assert kwargs["embeddings"] == [[0.1, 0.2]]
    assert [chunk.id for chunk in kwargs["chunks"]] == ["chunk-1"]
    assert [chunk.text for chunk in kwargs["chunks"]] == ["Regla uno."]


def test_ingest_rejects_payload_without_chunks(client):
    """RAG no acepta documentos brutos: API debe enviar chunks persistidos."""
    payload = _ingest_payload()
    payload["chunks"] = []

    response = client.post("/ingest", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "chunks"]


def test_ingest_returns_500_when_indexing_fails(client):
    """Los errores inesperados en embeddings o repositorio se traducen a 500."""
    embedding_service = MagicMock()
    embedding_service.embed_passages.side_effect = RuntimeError("fallo de embeddings")

    with patch("rag.service.get_embedding_service", return_value=embedding_service):
        response = client.post("/ingest", json=_ingest_payload())

    assert response.status_code == 500
    assert response.json() == {"detail": "Error interno al indexar el manual."}


def test_ingest_manual_raises_domain_error_when_repository_fails():
    """La capa interna conserva un error de dominio para fallos de indexado."""
    payload = IngestRequest(**_ingest_payload())
    embedding_service = MagicMock()
    embedding_service.embed_passages.return_value = [[0.1, 0.2]]
    repository = MagicMock()
    repository.upsert_manual.side_effect = RuntimeError("fallo de Chroma")

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
        pytest.raises(RagIndexingError),
    ):
        anyio.run(ingest_manual, payload)


def test_ingest_request_requires_prepared_chunks():
    """El contrato de entrada exige al menos un chunk preparado."""
    payload = _ingest_payload()
    payload.pop("chunks")

    with pytest.raises(ValidationError, match="chunks"):
        IngestRequest(**payload)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — recuperación de candidatos por juego
#   Clase 4: Juego con contexto indexado — devuelve candidatos sin texto.
#   Clase 5: Juego sin contexto — 404.
#   Clase 6: Falla inesperada del repositorio — 500.
# ---------------------------------------------------------------------------
def test_retrieve_returns_chunks(client):
    """La recuperación válida filtra por juego y no devuelve texto canónico."""
    repository = MagicMock()
    repository.query_game.return_value = [
        {
            "id": "chunk-1",
            "chunk_index": 0,
            "source_page": 1,
            "score": 0.99,
        }
    ]
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"game_id": _GAME_ID, "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "chunks": [
            {
                "id": "chunk-1",
                "chunk_index": 0,
                "source_page": 1,
                "score": 0.99,
            }
        ]
    }
    repository.query_game.assert_called_once_with(
        game_id=_GAME_ID,
        query_embedding=[0.3, 0.4],
        top_k=10,
    )


def test_retrieve_passes_custom_top_k(client):
    """Si API pide otro top_k, ese valor se pasa al repositorio vectorial."""
    repository = MagicMock()
    repository.query_game.return_value = []
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"game_id": _GAME_ID, "question": "¿Cómo se gana?", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json() == {"chunks": []}
    repository.query_game.assert_called_once_with(
        game_id=_GAME_ID,
        query_embedding=[0.3, 0.4],
        top_k=5,
    )


def test_retrieve_request_allows_internal_overfetch_limit():
    """RAG acepta el límite interno necesario para deduplicar en API."""
    request = RetrieveRequest(
        game_id=_GAME_ID,
        question="¿Cómo se gana?",
        top_k=RAG_RETRIEVAL_TOP_K_MAX,
    )

    assert request.top_k == RAG_RETRIEVAL_TOP_K_MAX


def test_retrieve_request_rejects_values_above_internal_limit():
    """RAG rechaza candidatos por encima del presupuesto interno acordado."""
    with pytest.raises(ValidationError, match="top_k"):
        RetrieveRequest(
            game_id=_GAME_ID,
            question="¿Cómo se gana?",
            top_k=RAG_RETRIEVAL_TOP_K_MAX + 1,
        )


def test_retrieve_returns_404_for_missing_game_context(client):
    """Si Chroma no tiene contexto del juego, el endpoint devuelve 404."""
    repository = MagicMock()
    repository.query_game.side_effect = ContextNotFoundError("game-missing")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"game_id": "game-missing", "question": "¿Algo?"},
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Contexto no encontrado."}


def test_retrieve_returns_500_when_query_fails(client):
    """Un error inesperado durante la búsqueda se traduce a 500."""
    repository = MagicMock()
    repository.query_game.side_effect = RuntimeError("fallo en Chroma")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"game_id": _GAME_ID, "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Error interno al recuperar el contexto del juego."
    }


def test_retrieve_error_log_sanitizes_game_id(client, caplog):
    """El game_id recibido no puede partir el log en varias líneas."""
    game_id = "game\r\n2025-01-01 [ERROR] FALSO"
    repository = MagicMock()
    repository.query_game.side_effect = RuntimeError("fallo en Chroma")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag.service.get_embedding_service", return_value=embedding_service),
        patch("rag.service.get_repository", return_value=repository),
        caplog.at_level(logging.ERROR, logger="rag.service"),
    ):
        response = client.post(
            "/retrieve",
            json={"game_id": game_id, "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 500
    messages = [
        record.getMessage()
        for record in caplog.records
        if (
            record.name == "rag.service"
            and "Error al recuperar contexto" in record.getMessage()
        )
    ]
    assert messages
    assert all("\r" not in message and "\n" not in message for message in messages)
    assert any("game??2025-01-01 [ERROR] FALSO" in message for message in messages)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — limpieza de Chroma tras borrado en Postgres
#   Clase 7: Borrado válido — elimina chunks derivados.
#   Clase 8: Fallo inesperado de Chroma — 500.
# ---------------------------------------------------------------------------
def test_delete_removes_manual_chunks(client):
    """El endpoint interno limpia Chroma con IDs decididos por Postgres."""
    repository = MagicMock()
    repository.delete_manual.return_value = 2

    with patch("rag.service.get_repository", return_value=repository):
        response = client.post(
            "/delete",
            json={"manual_id": _MANUAL_ID, "chunk_ids": ["chunk-1", "chunk-2"]},
        )

    assert response.status_code == 200
    assert response.json() == {
        "manual_id": _MANUAL_ID,
        "chunks_deleted": 2,
        "status": "deleted",
    }
    repository.delete_manual.assert_called_once_with(
        manual_id=_MANUAL_ID,
        chunk_ids=["chunk-1", "chunk-2"],
    )


def test_delete_returns_500_when_chroma_delete_fails(client):
    """Un fallo de Chroma se traduce a error interno del servicio RAG."""
    repository = MagicMock()
    repository.delete_manual.side_effect = RuntimeError("fallo en Chroma")

    with patch("rag.service.get_repository", return_value=repository):
        response = client.post(
            "/delete",
            json={"manual_id": _MANUAL_ID, "chunk_ids": ["chunk-1"]},
        )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Error interno al borrar el manual del índice."
    }
