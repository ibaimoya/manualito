import asyncio
import logging

from fastapi import HTTPException

from common.log_safety import safe_for_log
from rag.chunking import chunk_text
from rag.embeddings import get_embedding_service
from rag.exceptions import ManualNotFoundError
from rag.normalizer import normalize_ocr_lines, normalize_text
from rag.repository import get_repository
from rag.schemas import IngestRequest, RetrieveRequest

logger = logging.getLogger(__name__)


async def ingest_manual(payload: IngestRequest) -> dict:
    """
    Indexa un manual en ChromaDB a partir de texto libre u OCR estructurado.

    Normaliza el contenido, genera chunks, calcula embeddings y persiste el
    resultado bajo el ``manual_id`` indicado. Las operaciones pesadas
    (encode de embeddings y acceso a ChromaDB) se delegan a un thread del
    pool para no bloquear el event loop de FastAPI.
    """
    try:
        normalized = build_document_text(payload)
        if not normalized:
            raise HTTPException(
                status_code=422,
                detail="El documento no contiene texto indexable.",
            )

        chunks = chunk_text(normalized)
        if not chunks:
            raise HTTPException(
                status_code=422,
                detail="No se pudieron generar chunks del documento.",
            )

        embeddings = await asyncio.to_thread(
            get_embedding_service().embed_passages, chunks
        )
        chunks_indexed = await asyncio.to_thread(
            upsert_sync,
            payload.manual_id,
            chunks,
            embeddings,
            payload.source_page,
        )
    except HTTPException:
        raise
    except Exception as rag_err:
        logger.exception(
            "Error al indexar manual '%s'.",
            safe_for_log(payload.manual_id),
        )
        raise HTTPException(
            status_code=500,
            detail="Error interno al indexar el manual.",
        ) from rag_err

    return {
        "manual_id": payload.manual_id,
        "chunks_indexed": chunks_indexed,
        "status": "indexed",
    }


async def retrieve_chunks(payload: RetrieveRequest) -> dict:
    """
    Recupera los chunks más relevantes de un manual para una pregunta dada.

    El encode de la query y la consulta a ChromaDB se ejecutan en un thread
    del pool para no bloquear el event loop.
    """
    try:
        query_embedding = await asyncio.to_thread(
            get_embedding_service().embed_query, payload.question
        )
        chunks = await asyncio.to_thread(
            query_sync,
            payload.manual_id,
            query_embedding,
            payload.top_k,
        )
    except ManualNotFoundError:
        raise HTTPException(status_code=404, detail="Manual no encontrado.") from None
    except Exception as rag_err:
        logger.exception(
            "Error al recuperar contexto para '%s'.",
            safe_for_log(payload.manual_id),
        )
        raise HTTPException(
            status_code=500,
            detail="Error interno al recuperar el contexto del manual.",
        ) from rag_err

    return {"chunks": chunks}


def upsert_sync(
    manual_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    source_page: int | None,
) -> int:
    """Wrapper síncrono para invocar ``upsert_manual`` desde ``asyncio.to_thread``."""
    return get_repository().upsert_manual(
        manual_id=manual_id,
        chunks=chunks,
        embeddings=embeddings,
        source_page=source_page,
    )


def query_sync(
    manual_id: str,
    query_embedding: list[float],
    top_k: int,
) -> list[dict[str, object]]:
    """Wrapper síncrono para invocar ``query_manual`` desde ``asyncio.to_thread``."""
    return get_repository().query_manual(
        manual_id=manual_id,
        query_embedding=query_embedding,
        top_k=top_k,
    )


def build_document_text(payload: IngestRequest) -> str:
    """
    Construye el texto indexable a partir del payload de ingesta.

    Args:
        payload (IngestRequest): Petición de ingesta recibida por la API.

    Returns:
        str: Texto normalizado listo para chunking.
    """
    if payload.text:
        return normalize_text(payload.text)
    return normalize_ocr_lines([line.model_dump() for line in payload.ocr_lines or []])
