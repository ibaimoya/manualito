from fastapi import APIRouter

from common.schemas import HealthResponse
from llm.annotations import HttpClient
from llm.schemas import (
    GenerateRequest,
    GenerateResponse,
    UnloadIfIdleResponse,
)
from llm.service import generate_answer, unload_if_idle

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el servicio LLM está disponible."""
    return HealthResponse()


@router.post("/unload-if-idle", response_model_exclude_none=True)
async def unload_if_idle_endpoint(client: HttpClient) -> UnloadIfIdleResponse:
    """
    Descarga el modelo de Ollama si no hay generación activa.

    Lo usa el gateway antes de un OCR potencialmente pesado para liberar VRAM
    a PaddleOCR GPU. Es deliberadamente best-effort: si Ollama no responde, no
    debe romper el flujo de OCR.
    """
    payload = await unload_if_idle(client)
    return UnloadIfIdleResponse(**payload)


@router.post(
    "/generate",
    responses={
        500: {"description": "Error interno al generar la respuesta con el LLM."},
        502: {"description": "Servicio LLM no disponible o respuesta inválida."},
        504: {"description": "El LLM tardó demasiado en responder."},
    },
)
async def generate_endpoint(
    payload: GenerateRequest,
    client: HttpClient,
) -> GenerateResponse:
    """
    Genera una respuesta usando Ollama a partir de una pregunta y su contexto.

    Args:
        payload (GenerateRequest): Pregunta del usuario y chunks relevantes.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        GenerateResponse: Respuesta final limpia generada por el LLM.
    """
    return GenerateResponse(**await generate_answer(payload=payload, client=client))
