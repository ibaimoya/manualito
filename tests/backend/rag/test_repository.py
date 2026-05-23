import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock
from urllib.parse import urlunparse

import pytest
import repository
from repository import ChromaRepository, ManualNotFoundError

_TEST_CHROMA_URL = os.environ["CHROMA_URL"]
_CUSTOM_CHROMA_URL = urlunparse(("http", "mi-host:8123", "", "", "", ""))


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
    collection.get.return_value = {"ids": ["manual-1:0", "manual-1:1", "manual-1:2"]}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    count = repo.upsert_manual(
        manual_id="manual-1",
        chunks=["Regla uno", "Regla dos"],
        embeddings=[[0.1], [0.2]],
        source_page=5,
    )

    assert count == 2
    collection.upsert.assert_called_once_with(
        ids=["manual-1:0", "manual-1:1"],
        documents=["Regla uno", "Regla dos"],
        embeddings=[[0.1], [0.2]],
        metadatas=[
            {
                "manual_id": "manual-1",
                "chunk_index": 0,
                "length": 9,
                "source_page": 5,
            },
            {
                "manual_id": "manual-1",
                "chunk_index": 1,
                "length": 9,
                "source_page": 5,
            },
        ],
    )
    collection.delete.assert_called_once_with(ids=["manual-1:2"])


def test_upsert_manual_skips_delete_when_no_orphans_exist():
    """Si la nueva versión ya cubre todos los IDs existentes, no llama a delete."""
    collection = MagicMock()
    collection.get.return_value = {"ids": ["manual-1:0"]}
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    repo.upsert_manual(
        manual_id="manual-1",
        chunks=["Regla única"],
        embeddings=[[0.1]],
        source_page=None,
    )

    collection.delete.assert_not_called()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — recuperación por similitud
#   Clase 3: Manual existente con distancias válidas.
#   Clase 4: Manual inexistente — se lanza ManualNotFoundError.
# ---------------------------------------------------------------------------
def test_query_manual_returns_bounded_and_rounded_scores():
    """La consulta devuelve score en [0, 1] y redondeado a 4 decimales."""
    collection = MagicMock()
    collection.query.return_value = {
        "ids": [["manual-1:0", "manual-1:1"]],
        "documents": [["Regla uno", "Regla dos"]],
        "metadatas": [[
            {"chunk_index": 0, "source_page": 2},
            {"chunk_index": 1, "source_page": 3},
        ]],
        "distances": [[0.123456, 1.7]],
    }
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    chunks = repo.query_manual(
        manual_id="manual-1",
        query_embedding=[0.4, 0.5],
        top_k=2,
    )

    assert chunks == [
        {
            "id": "manual-1:0",
            "text": "Regla uno",
            "chunk_index": 0,
            "source_page": 2,
            "score": 0.8765,
        },
        {
            "id": "manual-1:1",
            "text": "Regla dos",
            "chunk_index": 1,
            "source_page": 3,
            "score": 0.0,
        },
    ]


def test_query_manual_raises_when_manual_has_no_indexed_chunks():
    """Si Chroma no devuelve IDs, el repositorio considera ausente el manual."""
    collection = MagicMock()
    collection.query.return_value = {
        "ids": [[]],
        "documents": [[]],
        "metadatas": [[]],
        "distances": [[]],
    }
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection

    with pytest.raises(ManualNotFoundError, match="manual-1"):
        repo.query_manual(
            manual_id="manual-1",
            query_embedding=[0.4, 0.5],
            top_k=2,
        )


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — consultas auxiliares del repositorio
#   Clase 5: El manual existe.
#   Clase 6: El manual no existe.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    ("ids", "expected"),
    [
        (["manual-1:0"], True),
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
#   Clase 7: La colección aún no existe — se crea.
#   Clase 8: El cliente aún no existe — se construye desde la URL.
# ---------------------------------------------------------------------------
def test_get_collection_creates_and_caches_collection():
    """La colección se crea una sola vez con el espacio de similitud esperado."""
    client = MagicMock()
    client.get_or_create_collection.return_value = "coleccion"
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._client = client

    first = repo._get_collection()
    second = repo._get_collection()

    assert first == "coleccion"
    assert second == "coleccion"
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
