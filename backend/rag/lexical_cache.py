"""Caché del índice léxico BM25 por juego."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass

from rag.lexical import Bm25Index, build_bm25_index, tokenize
from rag.repository import CorpusChunkData, get_repository


@dataclass(frozen=True)
class ChunkRef:
    """
    Identifica una aparición concreta de contenido en el corpus.

    Attributes:
        id (str): Identificador canónico del chunk.
        manual_id (str): Identificador del manual propietario.
        chunk_index (int): Posición del chunk dentro del manual.
        source_page (int): Página de origen del contenido.
    """

    id: str
    manual_id: str
    chunk_index: int
    source_page: int


@dataclass(frozen=True)
class LexicalDoc:
    """
    Agrupa todas las apariciones de un contenido deduplicado.

    Attributes:
        content_hash (str): Hash que identifica el contenido.
        occurrences (tuple[ChunkRef, ...]): Apariciones en orden de corpus.
    """

    content_hash: str
    occurrences: tuple[ChunkRef, ...]


@dataclass(frozen=True)
class GameLexicalIndex:
    """
    Conserva el índice BM25 y sus documentos alineados.

    Attributes:
        bm25 (Bm25Index): Índice construido sobre contenidos deduplicados.
        docs (tuple[LexicalDoc, ...]): Documentos alineados con BM25.
    """

    bm25: Bm25Index
    docs: tuple[LexicalDoc, ...]


def build_game_index(corpus: list[CorpusChunkData]) -> GameLexicalIndex:
    """
    Construye un índice léxico deduplicado a partir del corpus de un juego.

    Args:
        corpus (list[CorpusChunkData]): Chunks en su orden original.

    Returns:
        GameLexicalIndex: Índice BM25 y apariciones de cada contenido.
    """
    positions: dict[str, int] = {}
    content_hashes: list[str] = []
    occurrences: list[list[ChunkRef]] = []
    documents: list[list[str]] = []

    for chunk in corpus:
        content_hash = chunk["content_hash"]
        reference = ChunkRef(
            id=chunk["id"],
            manual_id=chunk["manual_id"],
            chunk_index=chunk["chunk_index"],
            source_page=chunk["source_page"],
        )
        position = positions.get(content_hash)

        if position is None:
            positions[content_hash] = len(content_hashes)
            content_hashes.append(content_hash)
            occurrences.append([reference])
            documents.append(tokenize(chunk["text"]))
        else:
            occurrences[position].append(reference)

    docs = tuple(
        LexicalDoc(
            content_hash=content_hash,
            occurrences=tuple(doc_occurrences),
        )
        for content_hash, doc_occurrences in zip(
            content_hashes,
            occurrences,
            strict=True,
        )
    )
    return GameLexicalIndex(
        bm25=build_bm25_index(documents),
        docs=docs,
    )


class LexicalIndexCache:
    """Mantiene un índice léxico reutilizable e invalidable por juego."""

    def __init__(
        self,
        *,
        load_corpus: Callable[[str], list[CorpusChunkData]],
    ) -> None:
        """
        Inicializa la caché con una función de carga síncrona.

        Args:
            load_corpus (Callable[[str], list[CorpusChunkData]]): Cargador del
                corpus completo de un juego.
        """
        self._load_corpus = load_corpus
        self._indexes: dict[str, GameLexicalIndex] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._generations: dict[str, int] = {}

    async def get(self, game_id: str) -> GameLexicalIndex:
        """
        Obtiene el índice del juego y lo construye una sola vez si falta.

        Args:
            game_id (str): Identificador del juego.

        Returns:
            GameLexicalIndex: Índice disponible para la petición actual.
        """
        cached = self._indexes.get(game_id)
        if cached is not None:
            return cached

        lock = self._locks.get(game_id)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[game_id] = lock

        async with lock:
            cached = self._indexes.get(game_id)
            if cached is not None:
                return cached

            generation = self._generations.get(game_id, 0)
            index = await asyncio.to_thread(self._load_and_build, game_id)

            if self._generations.get(game_id, 0) == generation:
                self._indexes[game_id] = index

            return index

    def invalidate(self, game_id: str) -> None:
        """
        Expulsa el índice de un juego y avanza su generación.

        Args:
            game_id (str): Identificador del juego.
        """
        self._generations[game_id] = self._generations.get(game_id, 0) + 1
        self._indexes.pop(game_id, None)

    def invalidate_all(self) -> None:
        """Expulsa todos los índices y avanza sus generaciones."""
        game_ids = (
            self._generations.keys()
            | self._indexes.keys()
            | self._locks.keys()
        )
        for game_id in game_ids:
            self._generations[game_id] = (
                self._generations.get(game_id, 0) + 1
            )
        self._indexes.clear()

    def _load_and_build(self, game_id: str) -> GameLexicalIndex:
        return build_game_index(self._load_corpus(game_id))


_lexical_cache: LexicalIndexCache | None = None


def _load_game_corpus(game_id: str) -> list[CorpusChunkData]:
    return get_repository().get_game_corpus(game_id=game_id)


def get_lexical_cache() -> LexicalIndexCache:
    """Devuelve el singleton de la caché léxica."""
    global _lexical_cache

    if _lexical_cache is None:
        _lexical_cache = LexicalIndexCache(
            load_corpus=_load_game_corpus,
        )

    return _lexical_cache
