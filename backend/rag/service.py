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

    indexed_at = datetime.now(UTC).isoformat()
    return IngestResponse(
        manual_id=payload.manual_id,
        chunks_indexed=chunks_indexed,
        status="indexed",
        embedding_model=EMBEDDING_MODEL,
        indexed_at=indexed_at,
        chunk_ids=[chunk.id for chunk in payload.chunks],
    )


async def retrieve_chunks(payload: RetrieveRequest) -> RetrieveResponse:
    """Recupera candidatos de Chroma dentro de los manuales autorizados."""
    try:
        query_embedding = await asyncio.to_thread(
            get_embedding_service().embed_query, payload.question
        )
        chunks = await asyncio.to_thread(
            query_sync,
            payload.game_id,
            payload.manual_ids,
            query_embedding,
            payload.top_k,
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
