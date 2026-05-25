from fastapi import APIRouter

from common.schemas import HealthResponse
from rag.schemas import (
    IngestRequest,
    IngestResponse,
    RetrieveRequest,
    RetrieveResponse,
)
from rag.service import ingest_manual, retrieve_chunks

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el servicio RAG está disponible."""
    return HealthResponse()


@router.post(
    "/ingest",
    responses={
        422: {"description": "El documento no contiene texto indexable."},
        500: {"description": "Error interno al indexar el manual."},
    },
)
async def ingest_endpoint(payload: IngestRequest) -> IngestResponse:
    """
    Indexa un manual en ChromaDB a partir de texto libre u OCR estructurado.

    Args:
        payload (IngestRequest): Cuerpo con el identificador del manual y el
                                 contenido textual a indexar.

    Returns:
        IngestResponse: ``manual_id``, número de chunks indexados y estado final.
    """
    return IngestResponse(**await ingest_manual(payload))


@router.post(
    "/retrieve",
    responses={
        404: {"description": "Manual no encontrado."},
        500: {"description": "Error interno al recuperar el contexto del manual."},
    },
)
async def retrieve_endpoint(payload: RetrieveRequest) -> RetrieveResponse:
    """
    Recupera los chunks más relevantes de un manual para una pregunta dada.

    Args:
        payload (RetrieveRequest): Identificador del manual, pregunta y top-k.

    Returns:
        RetrieveResponse: Lista de chunks relevantes con score y metadatos.
    """
    return RetrieveResponse(**await retrieve_chunks(payload))
