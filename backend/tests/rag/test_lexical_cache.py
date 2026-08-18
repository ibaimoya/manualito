import asyncio
import threading
from collections.abc import Iterator

import pytest

import rag.lexical_cache as lexical_cache_module
import rag.service as service
from rag.exceptions import RagIndexingError
from rag.lexical import rank_bm25, tokenize
from rag.lexical_cache import (
    ChunkRef,
    LexicalIndexCache,
    build_game_index,
)
from rag.repository import CorpusChunkData
from rag.schemas import DeleteRequest, IngestChunk, IngestRequest

_GAME_ID = "11111111-1111-4111-8111-111111111111"
_MANUAL_ID = "22222222-2222-4222-8222-222222222222"
_OWNER_USER_ID = "33333333-3333-4333-8333-333333333333"
_CHUNK_ID = "44444444-4444-4444-8444-444444444444"


@pytest.fixture(autouse=True)
def reset_lexical_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[None]:
    """Aísla el singleton de la caché entre tests."""
    monkeypatch.setattr(lexical_cache_module, "_lexical_cache", None)
    yield


def _corpus() -> list[CorpusChunkData]:
    return [
        {
            "id": "chunk-dragon-1",
            "text": "El dragón protege el castillo antiguo.",
            "manual_id": "manual-1",
            "content_hash": "hash-dragon",
            "chunk_index": 0,
            "source_page": 1,
        },
        {
            "id": "chunk-pocion",
            "text": "Las pociones restauran la salud del héroe.",
            "manual_id": "manual-1",
            "content_hash": "hash-pocion",
            "chunk_index": 1,
            "source_page": 2,
        },
        {
            "id": "chunk-dragon-2",
            "text": "El dragón protege el castillo antiguo.",
            "manual_id": "manual-2",
            "content_hash": "hash-dragon",
            "chunk_index": 4,
            "source_page": 7,
        },
    ]


class _CorpusLoader:
    def __init__(
        self,
        corpus: list[CorpusChunkData],
        *,
        release: threading.Event | None = None,
    ) -> None:
        self._corpus = corpus
        self._release = release
        self._counter_lock = threading.Lock()
        self.started = threading.Event()
        self.calls = 0
        self.game_ids: list[str] = []

    def __call__(self, game_id: str) -> list[CorpusChunkData]:
        with self._counter_lock:
            self.calls += 1
            self.game_ids.append(game_id)

        self.started.set()
        if self._release is not None and not self._release.wait(timeout=5):
            raise TimeoutError("The frozen corpus loader was not released")

        return list(self._corpus)


class _EmbeddingService:
    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return [[0.25, 0.75] for _ in texts]


class _Repository:
    def __init__(
        self,
        *,
        game_id: str | None = _GAME_ID,
        upsert_error: RuntimeError | None = None,
        lookup_error: RuntimeError | None = None,
    ) -> None:
        self.game_id = game_id
        self.upsert_error = upsert_error
        self.lookup_error = lookup_error
        self.upsert_calls = 0
        self.lookup_calls = 0
        self.delete_calls = 0

    def upsert_manual(
        self,
        *,
        manual_id: str,
        game_id: str,
        owner_user_id: str,
        language: str | None,
        chunks: list[IngestChunk],
        embeddings: list[list[float]],
    ) -> int:
        self.upsert_calls += 1
        _ = (
            manual_id,
            game_id,
            owner_user_id,
            language,
            embeddings,
        )
        if self.upsert_error is not None:
            raise self.upsert_error
        return len(chunks)

    def get_game_id_of_manual(self, *, manual_id: str) -> str | None:
        self.lookup_calls += 1
        _ = manual_id
        if self.lookup_error is not None:
            raise self.lookup_error
        return self.game_id

    def delete_manual(
        self,
        *,
        manual_id: str,
        chunk_ids: list[str],
    ) -> int:
        self.delete_calls += 1
        _ = manual_id
        return len(chunk_ids)


class _LexicalCache:
    def __init__(self) -> None:
        self.invalidated_game_ids: list[str] = []
        self.invalidate_all_calls = 0

    def invalidate(self, game_id: str) -> None:
        self.invalidated_game_ids.append(game_id)

    def invalidate_all(self) -> None:
        self.invalidate_all_calls += 1


def _install_service_fakes(
    monkeypatch: pytest.MonkeyPatch,
    *,
    repository: _Repository,
    lexical_cache: _LexicalCache,
) -> None:
    embedding_service = _EmbeddingService()

    def repository_factory() -> _Repository:
        return repository

    def lexical_cache_factory() -> _LexicalCache:
        return lexical_cache

    def embedding_service_factory() -> _EmbeddingService:
        return embedding_service

    monkeypatch.setattr(
        service,
        "get_repository",
        repository_factory,
    )
    monkeypatch.setattr(
        service,
        "get_lexical_cache",
        lexical_cache_factory,
    )
    monkeypatch.setattr(
        service,
        "get_embedding_service",
        embedding_service_factory,
    )


def _ingest_request() -> IngestRequest:
    return IngestRequest(
        manual_id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_OWNER_USER_ID,
        language="es",
        chunks=[
            IngestChunk(
                id=_CHUNK_ID,
                text="El dragón protege el castillo.",
                content_hash="a" * 64,
                chunk_index=0,
                source_page=1,
            )
        ],
    )


def _delete_request() -> DeleteRequest:
    return DeleteRequest(
        manual_id=_MANUAL_ID,
        chunk_ids=[_CHUNK_ID],
    )


async def _wait_until_started(loader: _CorpusLoader) -> None:
    started = await asyncio.to_thread(loader.started.wait, 2)
    assert started


def test_build_game_index_groups_occurrences_and_deduplicates_bm25() -> None:
    """Agrupa hashes repetidos sin perder sus apariciones ordenadas."""
    index = build_game_index(_corpus())

    assert index.docs == (
        lexical_cache_module.LexicalDoc(
            content_hash="hash-dragon",
            occurrences=(
                ChunkRef(
                    id="chunk-dragon-1",
                    manual_id="manual-1",
                    chunk_index=0,
                    source_page=1,
                ),
                ChunkRef(
                    id="chunk-dragon-2",
                    manual_id="manual-2",
                    chunk_index=4,
                    source_page=7,
                ),
            ),
        ),
        lexical_cache_module.LexicalDoc(
            content_hash="hash-pocion",
            occurrences=(
                ChunkRef(
                    id="chunk-pocion",
                    manual_id="manual-1",
                    chunk_index=1,
                    source_page=2,
                ),
            ),
        ),
    )
    assert index.bm25.doc_count == 2
    assert index.bm25.doc_lengths == (
        len(tokenize("El dragón protege el castillo antiguo.")),
        len(tokenize("Las pociones restauran la salud del héroe.")),
    )
    assert [
        doc_id
        for doc_id, _score in rank_bm25(
            index=index.bm25,
            query_tokens=tokenize("dragón castillo"),
        )
    ] == [0]


def test_build_game_index_returns_usable_empty_index() -> None:
    """Construye un índice consultable cuando el corpus está vacío."""
    index = build_game_index([])

    assert index.docs == ()
    assert index.bm25.doc_count == 0
    assert rank_bm25(
        index=index.bm25,
        query_tokens=tokenize("dragón"),
    ) == []


def test_cache_builds_once_and_reuses_the_index() -> None:
    """La segunda consulta reutiliza el índice ya construido."""
    loader = _CorpusLoader(_corpus())
    cache = LexicalIndexCache(load_corpus=loader)

    async def scenario() -> None:
        first = await cache.get("game-1")
        second = await cache.get("game-1")

        assert first is second

    asyncio.run(scenario())
    assert loader.calls == 1


def test_cache_uses_single_flight_for_the_same_game() -> None:
    """Dos consultas simultáneas comparten una sola construcción."""
    release = threading.Event()
    loader = _CorpusLoader(_corpus(), release=release)
    cache = LexicalIndexCache(load_corpus=loader)

    async def scenario() -> None:
        first_task = asyncio.create_task(cache.get("game-1"))
        second_task = asyncio.create_task(cache.get("game-1"))

        try:
            await _wait_until_started(loader)
        finally:
            release.set()

        first, second = await asyncio.gather(first_task, second_task)
        assert first is second

    asyncio.run(scenario())
    assert loader.calls == 1


def test_invalidate_between_gets_forces_a_second_build() -> None:
    """Invalidar un juego expulsa su índice ya construido."""
    loader = _CorpusLoader(_corpus())
    cache = LexicalIndexCache(load_corpus=loader)

    async def scenario() -> None:
        first = await cache.get("game-1")
        cache.invalidate("game-1")
        second = await cache.get("game-1")

        assert first is not second

    asyncio.run(scenario())
    assert loader.calls == 2


def test_invalidate_during_build_prevents_caching_stale_index() -> None:
    """Una invalidación concurrente evita guardar el índice en curso."""
    release = threading.Event()
    loader = _CorpusLoader(_corpus(), release=release)
    cache = LexicalIndexCache(load_corpus=loader)

    async def scenario() -> None:
        current_task = asyncio.create_task(cache.get("game-1"))

        try:
            await _wait_until_started(loader)
            cache.invalidate("game-1")
        finally:
            release.set()

        current = await current_task
        rebuilt = await cache.get("game-1")

        assert current is not rebuilt

    asyncio.run(scenario())
    assert loader.calls == 2


def test_invalidate_is_isolated_by_game() -> None:
    """Invalidar un juego conserva los índices de los demás."""
    loader = _CorpusLoader(_corpus())
    cache = LexicalIndexCache(load_corpus=loader)

    async def scenario() -> None:
        first_game = await cache.get("game-1")
        second_game = await cache.get("game-2")

        cache.invalidate("game-1")

        same_second_game = await cache.get("game-2")
        rebuilt_first_game = await cache.get("game-1")

        assert same_second_game is second_game
        assert rebuilt_first_game is not first_game

    asyncio.run(scenario())
    assert loader.calls == 3


def test_invalidating_unknown_or_empty_cache_is_safe() -> None:
    """Las invalidaciones sin entradas previas no producen errores."""
    loader = _CorpusLoader(_corpus())
    cache = LexicalIndexCache(load_corpus=loader)

    cache.invalidate("unknown-game")
    cache.invalidate_all()

    assert loader.calls == 0


def test_ingest_manual_invalidates_the_game_after_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Una ingesta correcta invalida el índice del juego."""
    repository = _Repository()
    lexical_cache = _LexicalCache()
    _install_service_fakes(
        monkeypatch,
        repository=repository,
        lexical_cache=lexical_cache,
    )

    response = asyncio.run(service.ingest_manual(_ingest_request()))

    assert response.chunks_indexed == 1
    assert repository.upsert_calls == 1
    assert lexical_cache.invalidated_game_ids == [_GAME_ID]


def test_ingest_manual_invalidates_the_game_after_upsert_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Una escritura parcial fallida también invalida el índice."""
    repository = _Repository(
        upsert_error=RuntimeError("upsert failed"),
    )
    lexical_cache = _LexicalCache()
    _install_service_fakes(
        monkeypatch,
        repository=repository,
        lexical_cache=lexical_cache,
    )

    with pytest.raises(RagIndexingError):
        asyncio.run(service.ingest_manual(_ingest_request()))

    assert repository.upsert_calls == 1
    assert lexical_cache.invalidated_game_ids == [_GAME_ID]


def test_delete_manual_invalidates_the_resolved_game(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """El borrado invalida únicamente el juego resuelto."""
    repository = _Repository(game_id=_GAME_ID)
    lexical_cache = _LexicalCache()
    _install_service_fakes(
        monkeypatch,
        repository=repository,
        lexical_cache=lexical_cache,
    )

    response = asyncio.run(service.delete_manual(_delete_request()))

    assert response.chunks_deleted == 1
    assert repository.lookup_calls == 1
    assert repository.delete_calls == 1
    assert lexical_cache.invalidated_game_ids == [_GAME_ID]
    assert lexical_cache.invalidate_all_calls == 0


def test_delete_manual_continues_and_invalidates_all_when_lookup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un lookup fallido no aborta el borrado y vacía toda la caché."""
    repository = _Repository(
        lookup_error=RuntimeError("lookup failed"),
    )
    lexical_cache = _LexicalCache()
    _install_service_fakes(
        monkeypatch,
        repository=repository,
        lexical_cache=lexical_cache,
    )

    response = asyncio.run(service.delete_manual(_delete_request()))

    assert response.chunks_deleted == 1
    assert repository.lookup_calls == 1
    assert repository.delete_calls == 1
    assert lexical_cache.invalidated_game_ids == []
    assert lexical_cache.invalidate_all_calls == 1
