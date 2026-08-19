from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import rag.lexical_cache as lexical_cache_module
import rag.service as rag_service
from rag.exceptions import ContextNotFoundError
from rag.lexical_cache import get_lexical_cache
from rag.repository import ChromaRepository
from rag.schemas import RetrieveRequest
from tests.rag.fakes import FakeChromaCollection, FakeChromaRecord

_GAME_ID = "00000000-0000-4000-8000-000000000001"
_OWNER_USER_ID = "00000000-0000-4000-8000-000000000002"
_MANUAL_ID = "00000000-0000-4000-8000-000000000003"
_OTHER_MANUAL_ID = "00000000-0000-4000-8000-000000000004"

_CHUNK_1 = "00000000-0000-4000-8000-000000000011"
_CHUNK_2 = "00000000-0000-4000-8000-000000000012"
_CHUNK_3 = "00000000-0000-4000-8000-000000000013"
_CHUNK_4 = "00000000-0000-4000-8000-000000000014"
_FORBIDDEN_CHUNK = "00000000-0000-4000-8000-000000000021"
_UNAUTHORIZED_DUPLICATE_CHUNK = "00000000-0000-4000-8000-000000000022"
_AUTHORIZED_DUPLICATE_CHUNK = "00000000-0000-4000-8000-000000000023"

_HASH_1 = "1" * 64
_HASH_2 = "2" * 64
_HASH_3 = "3" * 64
_HASH_4 = "4" * 64
_FORBIDDEN_HASH = "5" * 64
_DUPLICATE_HASH = "6" * 64

_QUERY_EMBEDDING = [0.25, 0.75]
_DENSE_QUESTION = "Manual del juego: ¿Dónde está el castillo?"
_LEXICAL_QUESTION = "dragon castillo"
_EXPECTED_HYBRID_RANKING = [
    (_CHUNK_2, 0.0325),
    (_CHUNK_1, 0.0164),
    (_CHUNK_4, 0.0161),
    (_CHUNK_3, 0.0159),
]


class _FakeEmbeddingService:
    """Servicio de embeddings tipado y determinista para las pruebas."""

    def __init__(self) -> None:
        self.queries: list[str] = []

    def embed_query(self, question: str) -> list[float]:
        """
        Devuelve el embedding fijo de una pregunta.

        Args:
            question (str): Pregunta recibida por el servicio.

        Returns:
            list[float]: Vector fijo usado por la colección falsa.
        """
        self.queries.append(question)
        return list(_QUERY_EMBEDDING)

    def embed_passages(self, passages: list[str]) -> list[list[float]]:
        """
        Devuelve un embedding fijo por pasaje.

        Args:
            passages (list[str]): Pasajes que se quieren representar.

        Returns:
            list[list[float]]: Un vector fijo por cada pasaje.
        """
        return [list(_QUERY_EMBEDDING) for _passage in passages]


@dataclass(frozen=True)
class _Harness:
    """Agrupa las dependencias observables de una prueba de recuperación."""

    collection: FakeChromaCollection
    repository: ChromaRepository
    embeddings: _FakeEmbeddingService


@pytest.fixture(autouse=True)
def clear_lexical_cache() -> Iterator[None]:
    """Vacía la caché léxica real antes y después de cada prueba."""
    cache = get_lexical_cache()
    cache.invalidate_all()
    yield
    cache.invalidate_all()


def _record(
    *,
    chunk_id: str,
    manual_id: str,
    content_hash: str,
    text: str,
    chunk_index: int,
    source_page: int,
) -> FakeChromaRecord:
    """
    Construye un registro completo para la colección Chroma falsa.

    Args:
        chunk_id (str): Identificador canónico del chunk.
        manual_id (str): Manual propietario del chunk.
        content_hash (str): Hash del contenido normalizado.
        text (str): Texto indexado en Chroma.
        chunk_index (int): Posición del chunk dentro del manual.
        source_page (int): Página de origen del chunk.

    Returns:
        FakeChromaRecord: Registro listo para el repositorio real.
    """
    return {
        "id": chunk_id,
        "document": text,
        "embedding": list(_QUERY_EMBEDDING),
        "metadata": {
            "manual_id": manual_id,
            "game_id": _GAME_ID,
            "owner_user_id": _OWNER_USER_ID,
            "language": "es",
            "chunk_index": chunk_index,
            "source_page": source_page,
            "content_hash": content_hash,
        },
    }


def _base_records() -> list[FakeChromaRecord]:
    """Devuelve el corpus de cuatro chunks usado por la fusión principal."""
    return [
        _record(
            chunk_id=_CHUNK_1,
            manual_id=_MANUAL_ID,
            content_hash=_HASH_1,
            text="preparar tablero",
            chunk_index=0,
            source_page=1,
        ),
        _record(
            chunk_id=_CHUNK_2,
            manual_id=_MANUAL_ID,
            content_hash=_HASH_2,
            text="dragon castillo",
            chunk_index=1,
            source_page=2,
        ),
        _record(
            chunk_id=_CHUNK_3,
            manual_id=_MANUAL_ID,
            content_hash=_HASH_3,
            text="contar puntos",
            chunk_index=2,
            source_page=3,
        ),
        _record(
            chunk_id=_CHUNK_4,
            manual_id=_MANUAL_ID,
            content_hash=_HASH_4,
            text="dragon",
            chunk_index=3,
            source_page=4,
        ),
    ]


def _install_harness(
    *,
    monkeypatch: pytest.MonkeyPatch,
    records: list[FakeChromaRecord],
    query_order: list[str],
    query_distances: list[float],
) -> _Harness:
    """
    Instala repositorio, caché y embeddings para una prueba.

    Args:
        monkeypatch (pytest.MonkeyPatch): Sustituciones de factorías singleton.
        records (list[FakeChromaRecord]): Corpus completo del juego.
        query_order (list[str]): Orden devuelto por la consulta densa.
        query_distances (list[float]): Distancias de los candidatos densos.

    Returns:
        _Harness: Dependencias reales y falsas usadas por la prueba.
    """
    collection = FakeChromaCollection(
        records=records,
        query_order=query_order,
        query_distances=query_distances,
    )
    repository = ChromaRepository('http://chroma-tests:8000', 'manuales')
    repository._collection = collection
    embeddings = _FakeEmbeddingService()

    monkeypatch.setattr(
        rag_service,
        "get_repository",
        lambda: repository,
    )
    monkeypatch.setattr(
        lexical_cache_module,
        "get_repository",
        lambda: repository,
    )
    monkeypatch.setattr(
        rag_service,
        "get_embedding_service",
        lambda: embeddings,
    )

    return _Harness(
        collection=collection,
        repository=repository,
        embeddings=embeddings,
    )


@pytest.mark.anyio
async def test_retrieve_without_lexical_question_keeps_dense_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mantiene la respuesta densa y consulta únicamente top_k candidatos."""
    harness = _install_harness(
        monkeypatch=monkeypatch,
        records=_base_records(),
        query_order=[_CHUNK_1, _CHUNK_2, _CHUNK_3],
        query_distances=[0.1, 0.2, 0.3],
    )
    expected_chunks = harness.repository.query_game(
        game_id=_GAME_ID,
        manual_ids=[_MANUAL_ID],
        query_embedding=list(_QUERY_EMBEDDING),
        top_k=2,
    )
    harness.collection.query_calls.clear()

    response = await rag_service.retrieve_chunks(
        RetrieveRequest(
            game_id=_GAME_ID,
            manual_ids=[_MANUAL_ID],
            question=_DENSE_QUESTION,
            top_k=2,
        )
    )

    assert [chunk.model_dump() for chunk in response.chunks] == [
        {
            "id": chunk["id"],
            "chunk_index": chunk["chunk_index"],
            "source_page": chunk["source_page"],
            "score": chunk["score"],
        }
        for chunk in expected_chunks
    ]
    assert harness.collection.query_calls[0]["n_results"] == 2
    assert harness.collection.get_calls == []
    assert harness.embeddings.queries == [_DENSE_QUESTION]


@pytest.mark.anyio
async def test_hybrid_retrieval_reorders_dense_results_with_real_rrf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reordena el corpus mediante BM25 y RRF calculados de verdad."""
    harness = _install_harness(
        monkeypatch=monkeypatch,
        records=_base_records(),
        query_order=[_CHUNK_1, _CHUNK_2, _CHUNK_3],
        query_distances=[0.1, 0.2, 0.3],
    )

    response = await rag_service.retrieve_chunks(
        RetrieveRequest(
            game_id=_GAME_ID,
            manual_ids=[_MANUAL_ID],
            question=_DENSE_QUESTION,
            lexical_question=_LEXICAL_QUESTION,
            top_k=4,
        )
    )

    assert [
        (chunk.id, chunk.score) for chunk in response.chunks
    ] == _EXPECTED_HYBRID_RANKING
    assert harness.collection.query_calls[0]["n_results"] == 20
    assert len(harness.collection.get_calls) == 1


@pytest.mark.anyio
async def test_stopword_only_question_keeps_dense_path_without_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Evita la caché léxica cuando la tokenización no produce términos."""
    harness = _install_harness(
        monkeypatch=monkeypatch,
        records=_base_records(),
        query_order=[_CHUNK_1, _CHUNK_2, _CHUNK_3],
        query_distances=[0.1, 0.2, 0.3],
    )

    response = await rag_service.retrieve_chunks(
        RetrieveRequest(
            game_id=_GAME_ID,
            manual_ids=[_MANUAL_ID],
            question=_DENSE_QUESTION,
            lexical_question="¿y el de la o?",
            top_k=2,
        )
    )

    assert [chunk.id for chunk in response.chunks] == [_CHUNK_1, _CHUNK_2]
    assert harness.collection.query_calls[0]["n_results"] == 2
    assert harness.collection.get_calls == []


@pytest.mark.anyio
async def test_hybrid_retrieval_preserves_context_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Propaga ContextNotFoundError cuando la pata densa está vacía."""
    harness = _install_harness(
        monkeypatch=monkeypatch,
        records=_base_records(),
        query_order=[],
        query_distances=[],
    )

    request = RetrieveRequest(
        game_id=_GAME_ID,
        manual_ids=[_MANUAL_ID],
        question=_DENSE_QUESTION,
        lexical_question=_LEXICAL_QUESTION,
        top_k=4,
    )

    with pytest.raises(ContextNotFoundError):
        await rag_service.retrieve_chunks(request)

    assert harness.collection.query_calls[0]["n_results"] == 20
    assert harness.collection.get_calls == []


@pytest.mark.anyio
async def test_hybrid_retrieval_filters_and_selects_authorized_occurrence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Descarta documentos no autorizados y elige la ocurrencia permitida."""
    records = [
        _record(
            chunk_id=_CHUNK_1,
            manual_id=_MANUAL_ID,
            content_hash=_HASH_1,
            text="reglas generales",
            chunk_index=0,
            source_page=1,
        ),
        _record(
            chunk_id=_FORBIDDEN_CHUNK,
            manual_id=_OTHER_MANUAL_ID,
            content_hash=_FORBIDDEN_HASH,
            text="obelisco prohibido",
            chunk_index=0,
            source_page=1,
        ),
        _record(
            chunk_id=_UNAUTHORIZED_DUPLICATE_CHUNK,
            manual_id=_OTHER_MANUAL_ID,
            content_hash=_DUPLICATE_HASH,
            text="obelisco",
            chunk_index=1,
            source_page=2,
        ),
        _record(
            chunk_id=_AUTHORIZED_DUPLICATE_CHUNK,
            manual_id=_MANUAL_ID,
            content_hash=_DUPLICATE_HASH,
            text="obelisco",
            chunk_index=1,
            source_page=2,
        ),
    ]
    _install_harness(
        monkeypatch=monkeypatch,
        records=records,
        query_order=[_CHUNK_1],
        query_distances=[0.1],
    )

    response = await rag_service.retrieve_chunks(
        RetrieveRequest(
            game_id=_GAME_ID,
            manual_ids=[_MANUAL_ID],
            question=_DENSE_QUESTION,
            lexical_question="obelisco prohibido",
            top_k=4,
        )
    )

    chunk_ids = [chunk.id for chunk in response.chunks]
    assert chunk_ids == [_CHUNK_1, _AUTHORIZED_DUPLICATE_CHUNK]
    assert _FORBIDDEN_CHUNK not in chunk_ids
    assert _UNAUTHORIZED_DUPLICATE_CHUNK not in chunk_ids
    assert chunk_ids.count(_AUTHORIZED_DUPLICATE_CHUNK) == 1


def test_empty_lexical_question_returns_422() -> None:
    """Rechaza una pregunta léxica vacía en la frontera HTTP."""
    app = FastAPI()
    app.add_api_route(
        "/retrieve",
        rag_service.retrieve_chunks,
        methods=["POST"],
    )

    with TestClient(app) as client:
        response = client.post(
            "/retrieve",
            json={
                "game_id": _GAME_ID,
                "manual_ids": [_MANUAL_ID],
                "question": _DENSE_QUESTION,
                "lexical_question": "",
                "top_k": 2,
            },
        )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_hybrid_retrieval_truncates_fusion_to_top_k(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Trunca el ranking fusionado después de calcular ambas patas."""
    harness = _install_harness(
        monkeypatch=monkeypatch,
        records=_base_records(),
        query_order=[_CHUNK_1, _CHUNK_2, _CHUNK_3],
        query_distances=[0.1, 0.2, 0.3],
    )

    response = await rag_service.retrieve_chunks(
        RetrieveRequest(
            game_id=_GAME_ID,
            manual_ids=[_MANUAL_ID],
            question=_DENSE_QUESTION,
            lexical_question=_LEXICAL_QUESTION,
            top_k=2,
        )
    )

    assert [
        (chunk.id, chunk.score) for chunk in response.chunks
    ] == _EXPECTED_HYBRID_RANKING[:2]
    assert harness.collection.query_calls[0]["n_results"] == 20
