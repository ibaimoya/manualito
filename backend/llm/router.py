from typing import Annotated

import httpx
from fastapi import APIRouter, Depends

from llm.dependencies import get_http_client
from llm.schemas import GenerateRequest
from llm.service import generate_answer, unload_if_idle

router = APIRouter()


@router.get("/health")
async def health():
    """Comprueba que el servicio LLM está disponible."""
    return {"status": "ok"}


@router.post("/unload-if-idle")
async def unload_if_idle_endpoint(
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Descarga el modelo de Ollama si no hay generación activa.

    Lo usa el gateway antes de un OCR potencialmente pesado para liberar VRAM
    a PaddleOCR GPU. Es deliberadamente best-effort: si Ollama no responde, no
    debe romper el flujo de OCR.
    """
    return await unload_if_idle(client)


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
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Genera una respuesta usando Ollama a partir de una pregunta y su contexto.

    Args:
        payload (GenerateRequest): Pregunta del usuario y chunks relevantes.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        dict: Respuesta final limpia generada por el LLM.
    """
    return await generate_answer(payload=payload, client=client)
