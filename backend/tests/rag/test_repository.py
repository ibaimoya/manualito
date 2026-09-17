from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from types import ModuleType
from urllib.parse import urlunparse

import pytest

import rag.repository as repository
from rag.exceptions import ContextNotFoundError
from rag.repository import ChromaCollection, ChromaRepository
from rag.schemas import IngestChunk
from tests.rag.fakes import FakeChromaCollection, FakeChromaRecord

_TEST_CHROMA_URL = os.environ["CHROMA_URL"]
_CUSTOM_CHROMA_URL = urlunparse(("http", "mi-host:8123", "", "", "", ""))
_CONTENT_HASH = "a" * 64
_SECOND_CONTENT_HASH = "b" * 64


class FakeChromaClient:
    """Entrega una colección falsa y registra su inicialización."""

    def __init__(self, *, collection: ChromaCollection) -> None:
        self.collection = collection
        self.calls: list[tuple[str, dict[str, str]]] = []

    def get_or_create_collection(
        self,
        *,
        name: str,
        metadata: dict[str, str],
    ) -> ChromaCollection:
        """
        Devuelve la colección configurada.

        Args:
            name (str): Nombre solicitado.
            metadata (dict[str, str]): Configuración de la colección.

        Returns:
            ChromaCollection: Colección falsa compartida.
        """
        self.calls.append((name, dict(metadata)))
        return self.collection


class FakeHttpClientFactory:
    """Construye siempre el mismo cliente falso de Chroma."""

    def __init__(self, *, client: FakeChromaClient) -> None:
        self.client = client
        self.calls: list[tuple[str, int]] = []

    def __call__(self, *, host: str, port: int) -> FakeChromaClient:
        """
        Registra la dirección solicitada y devuelve el cliente falso.

        Args:
            host (str): Nombre del servidor.
            port (int): Puerto del servidor.

        Returns:
            FakeChromaClient: Cliente falso configurado.
        """
        self.calls.append((host, port))
        return self.client


def _chunk(
    chunk_id: str,
    text: str,
    *,
    chunk_index: int,
    source_page: int = 5,
    content_hash: str = _CONTENT_HASH,
) -> IngestChunk:
    """
    Crea un chunk como el que entrega la API.

    Args:
        chunk_id (str): Identificador canónico.
        text (str): Contenido del chunk.
        chunk_index (int): Posición dentro del manual.
        source_page (int): Página de origen.
        content_hash (str): Huella del contenido.

    Returns:
        IngestChunk: Chunk preparado para indexar.
    """
    return IngestChunk(
        id=chunk_id,
        text=text,
        chunk_index=chunk_index,
        source_page=source_page,
        content_hash=content_hash,
    )


def _record(
    chunk_id: str,
    text: str,
    *,
    manual_id: str | None = "manual-1",
    game_id: str | int | None = "game-1",
    chunk_index: int = 0,
    source_page: int = 5,
    content_hash: str = _CONTENT_HASH,
) -> FakeChromaRecord:
    """
    Crea un registro completo para la colección falsa.

    Args:
        chunk_id (str): Identificador del registro.
        text (str): Documento almacenado.
        manual_id (str | None): Manual asociado o None para omitirlo.
        game_id (str | int | None): Juego asociado o None para omitirlo.
        chunk_index (int): Posición dentro del manual.
        source_page (int): Página de origen.
        content_hash (str): Huella del contenido.

    Returns:
        FakeChromaRecord: Registro listo para usar en memoria.
    """
    metadata: dict[str, str | int] = {
        "owner_user_id": "user-1",
        "source_page": source_page,
        "chunk_index": chunk_index,
        "content_hash": content_hash,
        "language": "es",
    }
    if manual_id is not None:
        metadata["manual_id"] = manual_id
    if game_id is not None:
        metadata["game_id"] = game_id

    return {
        "id": chunk_id,
        "document": text,
        "embedding": [float(chunk_index)],
        "metadata": metadata,
    }


def _repository_for(collection: FakeChromaCollection) -> ChromaRepository:
    """
    Crea un repositorio conectado únicamente a la colección falsa.

    Args:
        collection (FakeChromaCollection): Colección que recibirá las operaciones.

    Returns:
        ChromaRepository: Repositorio aislado de la red.
    """
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._collection = collection
    return repo


@pytest.fixture(autouse=True)
def reset_repository_singleton(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Reinicia el singleton global del repositorio entre tests."""
    monkeypatch.setattr(repository, "_repository", None)
    yield
    monkeypatch.setattr(repository, "_repository", None)


def test_upsert_manual_deletes_orphan_chunks_from_previous_versions() -> None:
    """Tras indexar una versión nueva, elimina solo los chunks huérfanos."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Texto anterior", chunk_index=0),
            _record("chunk-2", "Otro texto anterior", chunk_index=1),
            _record("chunk-old", "Texto huérfano", chunk_index=2),
        ]
    )
    repo = _repository_for(collection)

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
    assert collection.upsert_calls == [
        {
            "ids": ["chunk-1", "chunk-2"],
            "documents": ["Regla uno", "Regla dos"],
            "embeddings": [[0.1], [0.2]],
            "metadatas": [
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
        }
    ]
    assert collection.delete_calls == [["chunk-old"]]
    assert [record["id"] for record in collection.records] == [
        "chunk-1",
        "chunk-2",
    ]
    assert [record["document"] for record in collection.records] == [
        "Regla uno",
        "Regla dos",
    ]


def test_upsert_manual_uses_empty_language_when_absent() -> None:
    """Sin idioma detectado, la metadata conserva una cadena vacía."""
    collection = FakeChromaCollection()
    repo = _repository_for(collection)

    count = repo.upsert_manual(
        manual_id="manual-1",
        game_id="game-1",
        owner_user_id="user-1",
        language=None,
        chunks=[_chunk("chunk-1", "Regla única", chunk_index=0)],
        embeddings=[[0.1]],
    )

    assert count == 1
    assert collection.upsert_calls[0]["metadatas"][0]["language"] == ""
    assert collection.delete_calls == []


def test_query_game_returns_hashes_and_bounded_rounded_scores() -> None:
    """La consulta devuelve hashes y scores limitados y redondeados."""
    collection = FakeChromaCollection(
        records=[
            _record(
                "chunk-3",
                "No autorizado",
                manual_id="manual-3",
                content_hash="c" * 64,
            ),
            _record(
                "chunk-1",
                "Regla uno",
                manual_id="manual-1",
                chunk_index=0,
                source_page=2,
            ),
            _record(
                "chunk-2",
                "Regla dos",
                manual_id="manual-2",
                chunk_index=1,
                source_page=3,
                content_hash=_SECOND_CONTENT_HASH,
            ),
        ],
        query_order=["chunk-3", "chunk-1", "chunk-2"],
        query_distances=[0.05, 0.123456, 1.7],
    )
    repo = _repository_for(collection)

    chunks = repo.query_game(
        game_id="game-1",
        manual_ids=["manual-1", "manual-2"],
        query_embedding=[0.4, 0.5],
        top_k=2,
    )

    assert chunks == [
        {
            "id": "chunk-1",
            "chunk_index": 0,
            "source_page": 2,
            "content_hash": _CONTENT_HASH,
            "score": 0.8765,
        },
        {
            "id": "chunk-2",
            "chunk_index": 1,
            "source_page": 3,
            "content_hash": _SECOND_CONTENT_HASH,
            "score": 0.0,
        },
    ]
    assert collection.query_calls == [
        {
            "query_embeddings": [[0.4, 0.5]],
            "n_results": 2,
            "where": {
                "manual_id": {"$in": ["manual-1", "manual-2"]},
            },
        }
    ]


def test_query_game_raises_when_game_has_no_indexed_chunks() -> None:
    """Sin chunks autorizados, la consulta informa de contexto ausente."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla", manual_id="manual-1"),
        ]
    )
    repo = _repository_for(collection)

    with pytest.raises(ContextNotFoundError, match="game-1"):
        repo.query_game(
            game_id="game-1",
            manual_ids=["manual-9"],
            query_embedding=[0.4, 0.5],
            top_k=2,
        )

    assert collection.query_calls == [
        {
            "query_embeddings": [[0.4, 0.5]],
            "n_results": 2,
            "where": {"manual_id": {"$in": ["manual-9"]}},
        }
    ]


def test_delete_manual_deletes_known_chunk_ids() -> None:
    """Los IDs conocidos permiten borrar sin consultar por manual."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla uno"),
            _record("chunk-2", "Regla dos", chunk_index=1),
        ]
    )
    repo = _repository_for(collection)

    count = repo.delete_manual(
        manual_id="manual-1",
        chunk_ids=["chunk-1", "chunk-2"],
    )

    assert count == 2
    assert collection.get_calls == []
    assert collection.delete_calls == [["chunk-1", "chunk-2"]]
    assert collection.records == []


def test_delete_manual_falls_back_to_manual_lookup_when_ids_are_absent() -> None:
    """Sin IDs conocidos, el repositorio localiza los chunks por metadata."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla uno"),
            _record("chunk-2", "Otro manual", manual_id="manual-2"),
        ]
    )
    repo = _repository_for(collection)

    count = repo.delete_manual(manual_id="manual-1", chunk_ids=[])

    assert count == 1
    assert collection.get_calls == [
        {
            "include": [],
            "where": {"manual_id": "manual-1"},
            "limit": None,
            "offset": None,
        }
    ]
    assert collection.delete_calls == [["chunk-1"]]
    assert [record["id"] for record in collection.records] == ["chunk-2"]


def test_delete_manual_is_idempotent_when_no_chunks_exist() -> None:
    """Borrar un manual sin chunks devuelve cero y no ejecuta delete."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Otro manual", manual_id="manual-2"),
        ]
    )
    repo = _repository_for(collection)

    count = repo.delete_manual(manual_id="manual-1", chunk_ids=[])

    assert count == 0
    assert collection.delete_calls == []


def test_list_indexed_chunk_ids_groups_one_page_by_manual() -> None:
    """Una página agrupa los IDs por manual sin alterar su orden."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Uno", manual_id="manual-1"),
            _record("chunk-2", "Dos", manual_id="manual-2"),
            _record(
                "chunk-3",
                "Tres",
                manual_id="manual-1",
                chunk_index=1,
            ),
        ]
    )
    repo = _repository_for(collection)

    inventory = repo.list_indexed_chunk_ids()

    assert inventory == {
        "manual-1": ["chunk-1", "chunk-3"],
        "manual-2": ["chunk-2"],
    }
    assert collection.get_calls == [
        {
            "include": ["metadatas"],
            "where": None,
            "limit": 500,
            "offset": 0,
        }
    ]


@pytest.mark.parametrize(
    ("page_size", "record_specs", "expected", "expected_offsets"),
    [
        (
            2,
            [
                ("chunk-1", "manual-1"),
                ("chunk-2", "manual-2"),
                ("chunk-3", "manual-1"),
            ],
            {
                "manual-1": ["chunk-1", "chunk-3"],
                "manual-2": ["chunk-2"],
            },
            [0, 2],
        ),
        (
            3,
            [
                ("chunk-4", "manual-3"),
                ("chunk-5", "manual-4"),
            ],
            {
                "manual-3": ["chunk-4"],
                "manual-4": ["chunk-5"],
            },
            [0],
        ),
        (
            2,
            [
                ("chunk-6", "manual-5"),
                ("chunk-7", "manual-5"),
            ],
            {"manual-5": ["chunk-6", "chunk-7"]},
            [0, 2],
        ),
    ],
    ids=["dos_paginas", "primera_corta", "multiplo_exacto"],
)
def test_list_indexed_chunk_ids_paginates_until_short_page(
    monkeypatch: pytest.MonkeyPatch,
    page_size: int,
    record_specs: list[tuple[str, str]],
    expected: dict[str, list[str]],
    expected_offsets: list[int],
) -> None:
    """La paginación avanza hasta encontrar una página corta."""
    monkeypatch.setattr(repository, "_INVENTORY_PAGE_SIZE", page_size)
    collection = FakeChromaCollection(
        records=[
            _record(
                chunk_id,
                f"Texto {chunk_id}",
                manual_id=manual_id,
                chunk_index=index,
            )
            for index, (chunk_id, manual_id) in enumerate(record_specs)
        ]
    )
    repo = _repository_for(collection)

    inventory = repo.list_indexed_chunk_ids()

    assert inventory == expected
    assert collection.get_calls == [
        {
            "include": ["metadatas"],
            "where": None,
            "limit": page_size,
            "offset": offset,
        }
        for offset in expected_offsets
    ]


def test_list_indexed_chunk_ids_returns_empty_inventory() -> None:
    """Un índice vacío devuelve un inventario vacío."""
    collection = FakeChromaCollection()
    repo = _repository_for(collection)

    assert repo.list_indexed_chunk_ids() == {}


def test_list_indexed_chunk_ids_rejects_missing_metadatas() -> None:
    """El inventario rechaza una respuesta sin metadatos."""
    collection = FakeChromaCollection(
        records=[_record("chunk-1", "Regla")],
        omit_metadatas=True,
    )
    repo = _repository_for(collection)

    with pytest.raises(
        ValueError,
        match="no devolvió metadatos para el inventario",
    ):
        repo.list_indexed_chunk_ids()


def test_list_indexed_chunk_ids_rejects_invalid_manual_id() -> None:
    """El inventario rechaza chunks sin un manual válido."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla", manual_id=None),
        ]
    )
    repo = _repository_for(collection)

    with pytest.raises(ValueError, match="manual_id válido"):
        repo.list_indexed_chunk_ids()


@pytest.mark.parametrize(
    "exists",
    [True, False],
    ids=["manual_existe", "manual_no_existe"],
)
def test_manual_exists_reflects_collection_state(exists: bool) -> None:
    """manual_exists refleja si existe al menos un chunk del manual."""
    records = [_record("chunk-1", "Regla")] if exists else []
    collection = FakeChromaCollection(records=records)
    repo = _repository_for(collection)

    assert repo.manual_exists(manual_id="manual-1") is exists
    assert collection.get_calls == [
        {
            "include": [],
            "where": {"manual_id": "manual-1"},
            "limit": 1,
            "offset": None,
        }
    ]


def test_get_game_corpus_returns_complete_chunks_in_chroma_order() -> None:
    """El corpus conserva el orden y todos los datos internos requeridos."""
    collection = FakeChromaCollection(
        records=[
            _record(
                "chunk-2",
                "Segunda regla",
                manual_id="manual-2",
                chunk_index=1,
                source_page=11,
                content_hash=_SECOND_CONTENT_HASH,
            ),
            _record(
                "chunk-other",
                "Otro juego",
                manual_id="manual-3",
                game_id="game-2",
            ),
            _record(
                "chunk-1",
                "Primera regla",
                manual_id="manual-1",
                chunk_index=0,
                source_page=10,
            ),
        ]
    )
    repo = _repository_for(collection)

    corpus = repo.get_game_corpus(game_id="game-1")

    assert corpus == [
        {
            "id": "chunk-2",
            "text": "Segunda regla",
            "manual_id": "manual-2",
            "content_hash": _SECOND_CONTENT_HASH,
            "chunk_index": 1,
            "source_page": 11,
        },
        {
            "id": "chunk-1",
            "text": "Primera regla",
            "manual_id": "manual-1",
            "content_hash": _CONTENT_HASH,
            "chunk_index": 0,
            "source_page": 10,
        },
    ]
    assert collection.get_calls == [
        {
            "include": ["documents", "metadatas"],
            "where": {"game_id": "game-1"},
            "limit": 500,
            "offset": 0,
        }
    ]


def test_get_game_corpus_returns_empty_list_for_empty_game() -> None:
    """Un juego sin chunks devuelve una lista vacía."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Otro juego", game_id="game-2"),
        ]
    )
    repo = _repository_for(collection)

    assert repo.get_game_corpus(game_id="game-1") == []


def test_get_game_corpus_rejects_missing_documents() -> None:
    """El corpus rechaza una página no vacía sin documentos."""
    collection = FakeChromaCollection(
        records=[_record("chunk-1", "Regla")],
        omit_documents=True,
    )
    repo = _repository_for(collection)

    with pytest.raises(
        ValueError,
        match="no devolvió documentos para el corpus",
    ):
        repo.get_game_corpus(game_id="game-1")


def test_get_game_corpus_rejects_missing_metadatas() -> None:
    """El corpus rechaza una página no vacía sin metadatos."""
    collection = FakeChromaCollection(
        records=[_record("chunk-1", "Regla")],
        omit_metadatas=True,
    )
    repo = _repository_for(collection)

    with pytest.raises(
        ValueError,
        match="no devolvió metadatos para el corpus",
    ):
        repo.get_game_corpus(game_id="game-1")


@pytest.mark.parametrize(
    ("page_size", "chunk_count", "expected_offsets"),
    [
        (2, 3, [0, 2]),
        (3, 2, [0]),
        (2, 2, [0, 2]),
    ],
    ids=["dos_paginas", "primera_corta", "multiplo_exacto"],
)
def test_get_game_corpus_paginates_until_short_page(
    monkeypatch: pytest.MonkeyPatch,
    page_size: int,
    chunk_count: int,
    expected_offsets: list[int],
) -> None:
    """El corpus pagina hasta encontrar menos resultados que el límite."""
    monkeypatch.setattr(repository, "_INVENTORY_PAGE_SIZE", page_size)
    collection = FakeChromaCollection(
        records=[
            _record(
                f"chunk-{index}",
                f"Regla {index}",
                chunk_index=index,
                source_page=index + 1,
            )
            for index in range(chunk_count)
        ]
    )
    repo = _repository_for(collection)

    corpus = repo.get_game_corpus(game_id="game-1")

    assert [chunk["id"] for chunk in corpus] == [
        f"chunk-{index}" for index in range(chunk_count)
    ]
    assert collection.get_calls == [
        {
            "include": ["documents", "metadatas"],
            "where": {"game_id": "game-1"},
            "limit": page_size,
            "offset": offset,
        }
        for offset in expected_offsets
    ]


def test_get_game_id_of_manual_returns_game_with_chunks() -> None:
    """Un manual indexado devuelve el juego de su primer chunk."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla", game_id="game-7"),
            _record(
                "chunk-2",
                "Otra regla",
                game_id="game-7",
                chunk_index=1,
            ),
        ]
    )
    repo = _repository_for(collection)

    assert repo.get_game_id_of_manual(manual_id="manual-1") == "game-7"
    assert collection.get_calls == [
        {
            "include": ["metadatas"],
            "where": {"manual_id": "manual-1"},
            "limit": 1,
            "offset": None,
        }
    ]


def test_get_game_id_of_manual_returns_none_without_chunks() -> None:
    """Un manual sin chunks no tiene juego recuperable."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Otro manual", manual_id="manual-2"),
        ]
    )
    repo = _repository_for(collection)

    assert repo.get_game_id_of_manual(manual_id="manual-1") is None


def test_get_game_id_of_manual_returns_none_without_game_metadata() -> None:
    """Un chunk sin game_id no permite determinar el juego."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla", game_id=None),
        ]
    )
    repo = _repository_for(collection)

    assert repo.get_game_id_of_manual(manual_id="manual-1") is None


def test_get_game_id_of_manual_returns_none_for_non_string_game_id() -> None:
    """Un game_id no textual se considera metadata inválida."""
    collection = FakeChromaCollection(
        records=[
            _record("chunk-1", "Regla", game_id=7),
        ]
    )
    repo = _repository_for(collection)

    assert repo.get_game_id_of_manual(manual_id="manual-1") is None


def test_warm_up_creates_and_caches_collection() -> None:
    """El warmup solicita la colección una sola vez."""
    collection = FakeChromaCollection()
    client = FakeChromaClient(collection=collection)
    repo = ChromaRepository(_TEST_CHROMA_URL, "manuales")
    repo._client = client

    repo.warm_up()
    repo.warm_up()

    assert client.calls == [
        ("manuales", {"hnsw:space": "cosine"}),
    ]
    assert repo._collection is collection


def test_get_client_parses_host_port_and_reuses_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La URL produce un único cliente con el host y puerto correctos."""
    collection = FakeChromaCollection()
    client = FakeChromaClient(collection=collection)
    factory = FakeHttpClientFactory(client=client)
    chromadb_module = ModuleType("chromadb")
    chromadb_module.HttpClient = factory
    monkeypatch.setitem(sys.modules, "chromadb", chromadb_module)
    repo = ChromaRepository(_CUSTOM_CHROMA_URL, "manuales")

    first = repo._get_client()
    second = repo._get_client()

    assert first is client
    assert second is client
    assert factory.calls == [("mi-host", 8123)]


def test_get_repository_returns_singleton() -> None:
    """La factoría global reutiliza la misma instancia."""
    first = repository.get_repository()
    second = repository.get_repository()

    assert first is second
