from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

from chunking import chunk_text
from embeddings import get_embedding_service
from fastapi import FastAPI, HTTPException
from normalizer import normalize_ocr_lines, normalize_text
from pydantic import BaseModel, ConfigDict, Field, model_validator
from repository import ManualNotFoundError, get_repository

from common.filters import install_health_log_filter
from common.log_safety import safe_for_log

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Silencia los sondeos sanos repetidos de /health en los logs de uvicorn.
install_health_log_filter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Pre-calienta el servicio RAG antes de aceptar tráfico.

    Carga el modelo de embeddings desde disco (evita que la primera request
    pague el coste de la carga) e inicializa la conexión con ChromaDB. Así
    las singleton quedan pobladas antes de que el servidor acepte peticiones,
    lo que también elimina la race condition teórica entre tareas
    concurrentes que se ejecuten en el thread pool tras un ``asyncio.to_thread``.
    """
    logger.info("Pre-cargando modelo de embeddings y cliente ChromaDB...")
    await asyncio.to_thread(get_embedding_service()._load_model)
    await asyncio.to_thread(get_repository()._get_collection)
    logger.info("Servicio RAG listo.")
    yield


app = FastAPI(title="Manualito RAG Service", lifespan=lifespan)


class OCRLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1)]
    confidence: float | None = None


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manual_id: Annotated[str, Field(min_length=1)]
    text: str | None = None
    source_page: int | None = Field(default=1, ge=1)
    ocr_lines: list[OCRLine] | None = None

    @model_validator(mode="after")
    def validate_content(self) -> IngestRequest:
        if not self.text and not self.ocr_lines:
            raise ValueError("Se requiere 'text' o 'ocr_lines'.")
        return self


class RetrieveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manual_id: Annotated[str, Field(min_length=1)]
    question: Annotated[str, Field(min_length=1)]
    top_k: int = Field(default=3, ge=1, le=10)


@app.get("/health")
async def health():
    """Comprueba que el servicio RAG está disponible."""
    return {"status": "ok"}


@app.post("/ingest")
async def ingest_endpoint(payload: IngestRequest):
    """
    Indexa un manual en ChromaDB a partir de texto libre u OCR estructurado.

    Normaliza el contenido, genera chunks, calcula embeddings y persiste el
    resultado bajo el ``manual_id`` indicado. Las operaciones pesadas
    (encode de embeddings y acceso a ChromaDB) se delegan a un thread del
    pool para no bloquear el event loop de FastAPI.

    Args:
        payload (IngestRequest): Cuerpo con el identificador del manual y el
                                 contenido textual a indexar.

    Returns:
        dict: ``manual_id``, número de chunks indexados y estado final.

    Raises:
        HTTPException: 422 si no hay texto indexable; 500 si falla la ingesta.
    """
    try:
        normalized = _build_document_text(payload)
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
            _upsert_sync,
            payload.manual_id,
            chunks,
            embeddings,
            payload.source_page,
        )
    except HTTPException:
        raise
    except Exception as rag_err:
        logger.error(
            "Error al indexar manual '%s'.",
            safe_for_log(payload.manual_id),
            exc_info=True,
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


@app.post("/retrieve")
async def retrieve_endpoint(payload: RetrieveRequest):
    """
    Recupera los chunks más relevantes de un manual para una pregunta dada.

    El encode de la query y la consulta a ChromaDB se ejecutan en un thread
    del pool para no bloquear el event loop.

    Args:
        payload (RetrieveRequest): Identificador del manual, pregunta y top-k.

    Returns:
        dict: Lista de chunks relevantes con score y metadatos.

    Raises:
        HTTPException: 404 si el manual no existe; 500 si falla la recuperación.
    """
    try:
        query_embedding = await asyncio.to_thread(
            get_embedding_service().embed_query, payload.question
        )
        chunks = await asyncio.to_thread(
            _query_sync,
            payload.manual_id,
            query_embedding,
            payload.top_k,
        )
    except ManualNotFoundError:
        raise HTTPException(status_code=404, detail="Manual no encontrado.") from None
    except Exception as rag_err:
        logger.error(
            "Error al recuperar contexto para '%s'.",
            safe_for_log(payload.manual_id),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail="Error interno al recuperar el contexto del manual.",
        ) from rag_err

    return {"chunks": chunks}


def _upsert_sync(
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


def _query_sync(
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


def _build_document_text(payload: IngestRequest) -> str:
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
