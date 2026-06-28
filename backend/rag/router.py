from fastapi import APIRouter

from common.schemas import HealthResponse
from rag.schemas import (
    DeleteRequest,
    DeleteResponse,
    IngestRequest,
    IngestResponse,
    RetrieveRequest,
    RetrieveResponse,
)
from rag.service import delete_manual, ingest_manual, retrieve_chunks

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el servicio RAG está disponible."""
    return HealthResponse()


@router.post(
    "/ingest",
    responses={
        422: {"description": "La petición no contiene chunks válidos."},
        500: {"description": "Error interno al indexar el manual."},
    },
)
async def ingest_endpoint(payload: IngestRequest) -> IngestResponse:
    """
    Indexa en ChromaDB chunks ya persistidos por API en Postgres.

    Args:
        payload (IngestRequest): Manual, juego, propietario y chunks a indexar.

    Returns:
        IngestResponse: Estado del indexado y metadatos de sincronización.
    """
    return await ingest_manual(payload)


@router.post(
    "/retrieve",
    responses={
        404: {"description": "Contexto de juego no encontrado."},
        500: {"description": "Error interno al recuperar el contexto del juego."},
    },
)
async def retrieve_endpoint(payload: RetrieveRequest) -> RetrieveResponse:
    """
    Recupera candidatos vectoriales de un juego para una pregunta dada.

    Args:
        payload (RetrieveRequest): Identificador del juego, pregunta y top-k.

    Returns:
        RetrieveResponse: Lista de IDs rehidratables con score y metadatos.
    """
    return await retrieve_chunks(payload)


@router.post(
    "/delete",
    responses={
        500: {"description": "Error interno al borrar chunks del índice."},
    },
)
async def delete_endpoint(payload: DeleteRequest) -> DeleteResponse:
    """
    Borra de Chroma chunks de un manual que API ya marcó como borrado.

    Args:
        payload (DeleteRequest): Identificador del manual y chunks a limpiar.

    Returns:
        DeleteResponse: Número de chunks eliminados del índice derivado.
    """
    return await delete_manual(payload)
