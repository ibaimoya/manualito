import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import urlunparse

import pytest

import rag.repository as repository
from rag.exceptions import ContextNotFoundError
from rag.repository import ChromaRepository
from rag.schemas import IngestChunk

_TEST_CHROMA_URL = os.environ["CHROMA_URL"]
_CUSTOM_CHROMA_URL = urlunparse(("http", "mi-host:8123", "", "", "", ""))
_CONTENT_HASH = "a" * 64


def _chunk(
    chunk_id: str,
    text: str,
    *,
    chunk_index: int,
    source_page: int = 5,
) -> IngestChunk:
    """Crea un chunk preparado como lo enviaría API."""
    return IngestChunk(
        id=chunk_id,
        text=text,
        chunk_index=chunk_index,
        source_page=source_page,
        content_hash=_CONTENT_HASH,
    )


@pytest.fixture(autouse=True)
def reset_repository_singleton(monkeypatch):
    """Reinicia el singleton global del repositorio entre tests."""
    monkeypatch.setattr(repository, "_repository", None)
    yield
    monkeypatch.setattr(repository, "_repository", None)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — persistencia de manuales
#   Clase 1: Upsert correcto con chunks huérfanos previos.
#   Clase 2: Upsert correcto sin chunks huérfanos.
# ---------------------------------------------------------------------------
def test_upsert_manual_deletes_orphan_chunks_from_previous_versions():
    """Tras indexar la versión nueva, borra solo los IDs sobrantes anteriores."""
    collection = MagicMock()
    collection.get.return_value = {"ids": ["chunk-1", "chunk-2", "chunk-old"]}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    count = repo.upsert_manual(
        manual_id="manual-1",
        game_id="game-1",
        owner_user_id="user-1",
        language="es",
        chunks=[
            _chunk("chunk-1", "Regla uno", chunk_index=0),
            _chunk("chunk-2", "Regla dos", chunk_index=1),
        ],
        embeddings=[[0.1], [0.2]],
    )

    assert count == 2
    collection.upsert.assert_called_once_with(
        ids=["chunk-1", "chunk-2"],
        documents=["Regla uno", "Regla dos"],
        embeddings=[[0.1], [0.2]],
        metadatas=[
            {
                "manual_id": "manual-1",
                "game_id": "game-1",
                "owner_user_id": "user-1",
                "source_page": 5,
                "chunk_index": 0,
                "content_hash": _CONTENT_HASH,
                "language": "es",
            },
            {
                "manual_id": "manual-1",
                "game_id": "game-1",
                "owner_user_id": "user-1",
                "source_page": 5,
                "chunk_index": 1,
                "content_hash": _CONTENT_HASH,
                "language": "es",
            },
        ],
    )
    collection.delete.assert_called_once_with(ids=["chunk-old"])


def test_upsert_manual_uses_empty_language_when_absent():
    """Si no hay idioma detectado, la metadata mantiene una clave estable."""
    collection = MagicMock()
    collection.get.return_value = {"ids": ["chunk-1"]}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    repo.upsert_manual(
        manual_id="manual-1",
        game_id="game-1",
        owner_user_id="user-1",
        language=None,
        chunks=[_chunk("chunk-1", "Regla única", chunk_index=0)],
        embeddings=[[0.1]],
    )

    metadata = collection.upsert.call_args.kwargs["metadatas"][0]
    assert metadata["language"] == ""
    collection.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — recuperación por similitud
#   Clase 3: Juego con contexto indexado y distancias válidas.
#   Clase 4: Juego sin contexto — se lanza ContextNotFoundError.
# ---------------------------------------------------------------------------
def test_query_game_returns_bounded_and_rounded_scores():
    """La consulta devuelve score en [0, 1] y redondeado a 4 decimales."""
    collection = MagicMock()
    collection.query.return_value = {
        "ids": [["chunk-1", "chunk-2"]],
        "metadatas": [[
            {"chunk_index": 0, "source_page": 2},
            {"chunk_index": 1, "source_page": 3},
        ]],
        "distances": [[0.123456, 1.7]],
    }
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    chunks = repo.query_game(
        game_id="game-1",
        query_embedding=[0.4, 0.5],
        top_k=2,
    )

    assert chunks == [
        {
            "id": "chunk-1",
            "chunk_index": 0,
            "source_page": 2,
            "score": 0.8765,
        },
        {
            "id": "chunk-2",
            "chunk_index": 1,
            "source_page": 3,
            "score": 0.0,
        },
    ]
    collection.query.assert_called_once_with(
        query_embeddings=[[0.4, 0.5]],
        n_results=2,
        where={"game_id": "game-1"},
    )


def test_query_game_raises_when_game_has_no_indexed_chunks():
    """Si Chroma no devuelve IDs, el repositorio considera ausente el contexto."""
    collection = MagicMock()
    collection.query.return_value = {
        "ids": [[]],
        "metadatas": [[]],
        "distances": [[]],
    }
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    with pytest.raises(ContextNotFoundError, match="game-1"):
        repo.query_game(
            game_id="game-1",
            query_embedding=[0.4, 0.5],
            top_k=2,
        )


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — borrado de chunks derivados
#   Clase 5: Borrado con IDs conocidos.
#   Clase 6: Borrado reconstruyendo IDs desde manual_id.
#   Clase 7: Manual sin chunks en Chroma.
# ---------------------------------------------------------------------------
def test_delete_manual_deletes_known_chunk_ids():
    """Si API envía IDs de chunks, Chroma no necesita consultar por manual_id."""
    collection = MagicMock()
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    count = repo.delete_manual(manual_id="manual-1", chunk_ids=["chunk-1", "chunk-2"])

    assert count == 2
    collection.get.assert_not_called()
    collection.delete.assert_called_once_with(ids=["chunk-1", "chunk-2"])


def test_delete_manual_falls_back_to_manual_lookup_when_ids_are_absent():
    """El repositorio puede limpiar un manual completo desde metadata."""
    collection = MagicMock()
    collection.get.return_value = {"ids": ["chunk-1"]}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    count = repo.delete_manual(manual_id="manual-1", chunk_ids=[])

    assert count == 1
    collection.get.assert_called_once_with(where={"manual_id": "manual-1"}, include=[])
    collection.delete.assert_called_once_with(ids=["chunk-1"])


def test_delete_manual_is_idempotent_when_no_chunks_exist():
    """Borrar un manual sin vectores indexados no falla."""
    collection = MagicMock()
    collection.get.return_value = {"ids": []}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    count = repo.delete_manual(manual_id="manual-1", chunk_ids=[])

    assert count == 0
    collection.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — consultas auxiliares del repositorio
#   Clase 8: El manual existe.
#   Clase 9: El manual no existe.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("ids", "expected"),
    [
        (["chunk-1"], True),
        ([], False),
    ],
    ids=["manual_existe", "manual_no_existe"],
)
def test_manual_exists_consulta_la_coleccion(ids, expected):
    """manual_exists refleja si la colección devuelve al menos un ID."""
    collection = MagicMock()
    collection.get.return_value = {"ids": ids}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    assert repo.manual_exists("manual-1") is expected


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — inicialización perezosa de Chroma
#   Clase 10: La colección aún no existe — se crea.
#   Clase 11: El cliente aún no existe — se construye desde la URL.
# ---------------------------------------------------------------------------
def test_warm_up_creates_and_caches_collection():
    """El warmup crea la colección una sola vez con el espacio esperado."""
    client = MagicMock()
    client.get_or_create_collection.return_value = "coleccion"
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._client = client

    repo.warm_up()
    repo.warm_up()

    client.get_or_create_collection.assert_called_once_with(
        name="manuales",
        metadata={"hnsw:space": "cosine"},
    )


def test_get_client_parses_host_port_and_reuses_client(monkeypatch):
    """La URL de Chroma se traduce a HttpClient una sola vez por repositorio."""
    http_client = MagicMock(return_value="cliente-chroma")
    monkeypatch.setitem(
        sys.modules,
        "chromadb",
        SimpleNamespace(HttpClient=http_client),
    )
    repo = ChromaRepository(_CUSTOM_CHROMA_URL, "manuales")

    first = repo._get_client()
    second = repo._get_client()

    assert first == "cliente-chroma"
    assert second == "cliente-chroma"
    http_client.assert_called_once_with(host="mi-host", port=8123)


def test_get_repository_returns_singleton():
    """La factoría global devuelve siempre la misma instancia compartida."""
    first = repository.get_repository()
    second = repository.get_repository()

    assert first is second
