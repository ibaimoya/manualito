import asyncio
import logging
from datetime import UTC, datetime

from common.logging import safe_for_log
from rag.embeddings import EMBEDDING_MODEL, get_embedding_service
from rag.exceptions import (
    ContextNotFoundError,
    RagDeletionError,
    RagIndexingError,
    RagInventoryError,
    RagRetrievalError,
)
from rag.fusion import fuse_rrf
from rag.lexical import rank_bm25, tokenize
from rag.lexical_cache import ChunkRef, get_lexical_cache
from rag.repository import RetrievedChunkData, get_repository
from rag.schemas import (
    DeleteRequest,
    DeleteResponse,
    IngestRequest,
    IngestResponse,
    InventoryResponse,
    RetrievedChunk,
    RetrieveRequest,
    RetrieveResponse,
)

logger = logging.getLogger(__name__)

_FUSION_CANDIDATES = 20


async def ingest_manual(payload: IngestRequest) -> IngestResponse:
    """
    Indexa en Chroma chunks ya persistidos por API en Postgres.

    RAG no normaliza, no trocea y no decide IDs. El id de cada vector es el
    UUID del chunk canónico guardado en Postgres.
    """
    texts = [chunk.text for chunk in payload.chunks]
    try:
        embeddings = await asyncio.to_thread(
            get_embedding_service().embed_passages, texts
        )
        chunks_indexed = await asyncio.to_thread(
            upsert_sync,
            payload,
            embeddings,
        )
    except Exception as rag_err:
        logger.exception(
            "Error al indexar manual '%s'.",
            safe_for_log(payload.manual_id),
        )
        raise RagIndexingError from rag_err
    finally:
        # Ante una cancelación a mitad de escritura, la reconciliación periódica sana la deriva.
        get_lexical_cache().invalidate(payload.game_id)

    indexed_at = datetime.now(UTC).isoformat()
    return IngestResponse(
        manual_id=payload.manual_id,
        chunks_indexed=chunks_indexed,
        status="indexed",
        embedding_model=EMBEDDING_MODEL,
        indexed_at=indexed_at,
        chunk_ids=[chunk.id for chunk in payload.chunks],
    )


def _deduplicate_dense_chunks(
    *,
    chunks: list[RetrievedChunkData],
) -> tuple[dict[str, RetrievedChunkData], list[str]]:
    """Deduplica la pata densa por hash conservando el primer resultado."""
    chunks_by_hash: dict[str, RetrievedChunkData] = {}
    hashes: list[str] = []
    for chunk in chunks:
        content_hash = chunk["content_hash"]
        if content_hash in chunks_by_hash:
            continue
        chunks_by_hash[content_hash] = chunk
        hashes.append(content_hash)

    return chunks_by_hash, hashes


async def _rank_authorized_lexical_chunks(
    *,
    game_id: str,
    manual_ids: list[str],
    query_tokens: list[str],
) -> tuple[dict[str, ChunkRef], list[str]]:
    """Obtiene la pata léxica limitada a los manuales autorizados."""
    lexical_index = await get_lexical_cache().get(game_id)
    ranking = rank_bm25(
        index=lexical_index.bm25,
        query_tokens=query_tokens,
    )
    authorized_manual_ids = set(manual_ids)
    chunks_by_hash: dict[str, ChunkRef] = {}
    hashes: list[str] = []

    for document_position, _lexical_score in ranking:
        document = lexical_index.docs[document_position]
        occurrence = next(
            (
                candidate
                for candidate in document.occurrences
                if candidate.manual_id in authorized_manual_ids
            ),
            None,
        )
        if occurrence is None:
            continue

        chunks_by_hash[document.content_hash] = occurrence
        hashes.append(document.content_hash)
        if len(hashes) == _FUSION_CANDIDATES:
            break

    return chunks_by_hash, hashes


def _fuse_hybrid_chunks(
    *,
    semantic_chunks: dict[str, RetrievedChunkData],
    semantic_hashes: list[str],
    lexical_chunks: dict[str, ChunkRef],
    lexical_hashes: list[str],
    top_k: int,
) -> list[RetrievedChunkData]:
    """Fusiona ambas patas y construye los chunks recuperados."""
    fused_chunks: list[RetrievedChunkData] = []
    for content_hash, rrf_score in fuse_rrf(
        semantic=semantic_hashes,
        lexical=lexical_hashes,
    )[:top_k]:
        dense_chunk = semantic_chunks.get(content_hash)
        if dense_chunk is not None:
            chunk_id = dense_chunk["id"]
            chunk_index = dense_chunk["chunk_index"]
            source_page = dense_chunk["source_page"]
        else:
            lexical_chunk = lexical_chunks[content_hash]
            chunk_id = lexical_chunk.id
            chunk_index = lexical_chunk.chunk_index
            source_page = lexical_chunk.source_page

        fused_chunks.append(
            {
                "id": chunk_id,
                "chunk_index": chunk_index,
                "source_page": source_page,
                "content_hash": content_hash,
                "score": round(rrf_score, 4),
            }
        )

    return fused_chunks


async def retrieve_chunks(payload: RetrieveRequest) -> RetrieveResponse:
    """
    Recupera candidatos autorizados mediante búsqueda densa o híbrida.

    En el camino híbrido la puntuación RRF se redondea a cuatro decimales.
    La API consumidora utiliza solo los IDs de los chunks recuperados.

    Args:
        payload (RetrieveRequest): Juego, manuales y preguntas de búsqueda.

    Returns:
        RetrieveResponse: Candidatos ordenados y limitados por ``top_k``.

    Raises:
        ContextNotFoundError: Si la consulta densa no encuentra contexto.
        RagRetrievalError: Si falla cualquier operación de recuperación.
    """
    try:
        lexical_tokens = (
            tokenize(payload.lexical_question)
            if payload.lexical_question is not None
            else []
        )
        query_embedding = await asyncio.to_thread(
            get_embedding_service().embed_query, payload.question
        )
        query_top_k = (
            _FUSION_CANDIDATES if lexical_tokens else payload.top_k
        )
        chunks = await asyncio.to_thread(
            query_sync,
            payload.game_id,
            payload.manual_ids,
            query_embedding,
            query_top_k,
        )

        if lexical_tokens:
            semantic_chunks, semantic_hashes = _deduplicate_dense_chunks(
                chunks=chunks
            )
            lexical_chunks, lexical_hashes = (
                await _rank_authorized_lexical_chunks(
                    game_id=payload.game_id,
                    manual_ids=payload.manual_ids,
                    query_tokens=lexical_tokens,
                )
            )
            chunks = _fuse_hybrid_chunks(
                semantic_chunks=semantic_chunks,
                semantic_hashes=semantic_hashes,
                lexical_chunks=lexical_chunks,
                lexical_hashes=lexical_hashes,
                top_k=payload.top_k,
            )
    except ContextNotFoundError:
        raise
    except Exception as rag_err:
        logger.exception(
            "Error al recuperar contexto para juego '%s'.",
            safe_for_log(payload.game_id),
        )
        raise RagRetrievalError from rag_err

    return RetrieveResponse(
        chunks=[
            RetrievedChunk(
                id=chunk["id"],
                chunk_index=chunk["chunk_index"],
                source_page=chunk["source_page"],
                score=chunk["score"],
            )
            for chunk in chunks
        ]
    )


async def delete_manual(payload: DeleteRequest) -> DeleteResponse:
    """Limpia de Chroma los chunks derivados de un manual borrado en Postgres."""
    try:
        game_id = await asyncio.to_thread(
            get_repository().get_game_id_of_manual,
            manual_id=payload.manual_id,
        )
    except Exception:
        game_id = None

    try:
        chunks_deleted = await asyncio.to_thread(
            delete_sync,
            payload.manual_id,
            payload.chunk_ids,
        )
    except Exception as rag_err:
        logger.exception(
            "Error al borrar del índice el manual '%s'.",
            safe_for_log(payload.manual_id),
        )
        raise RagDeletionError from rag_err
    finally:
        lexical_cache = get_lexical_cache()
        if game_id is None:
            lexical_cache.invalidate_all()
        else:
            lexical_cache.invalidate(game_id)

    return DeleteResponse(
        manual_id=payload.manual_id,
        chunks_deleted=chunks_deleted,
        status="deleted",
    )


async def list_index_inventory() -> InventoryResponse:
    """
    Consulta todos los chunks indexados y los agrupa por manual.

    Returns:
        InventoryResponse: Inventario completo del índice derivado.

    Raises:
        RagInventoryError: Si Chroma no puede devolver el inventario.
    """
    try:
        manuals = await asyncio.to_thread(
            get_repository().list_indexed_chunk_ids
        )
    except Exception as rag_err:
        logger.exception("Error al consultar el inventario del índice.")
        raise RagInventoryError from rag_err

    return InventoryResponse(manuals=manuals)


def upsert_sync(payload: IngestRequest, embeddings: list[list[float]]) -> int:
    """Wrapper síncrono para invocar Chroma desde ``asyncio.to_thread``."""
    return get_repository().upsert_manual(
        manual_id=payload.manual_id,
        game_id=payload.game_id,
        owner_user_id=payload.owner_user_id,
        language=payload.language,
        chunks=payload.chunks,
        embeddings=embeddings,
    )


def query_sync(
    game_id: str,
    manual_ids: list[str],
    query_embedding: list[float],
    top_k: int,
) -> list[RetrievedChunkData]:
    """Wrapper síncrono para consultar Chroma desde ``asyncio.to_thread``."""
    return get_repository().query_game(
        game_id=game_id,
        manual_ids=manual_ids,
        query_embedding=query_embedding,
        top_k=top_k,
    )


def delete_sync(manual_id: str, chunk_ids: list[str]) -> int:
    """Wrapper síncrono para borrar chunks desde ``asyncio.to_thread``."""
    return get_repository().delete_manual(manual_id=manual_id, chunk_ids=chunk_ids)
