from fastapi import APIRouter

from common.schemas import HealthResponse
from llm.annotations import HttpClient
from llm.schemas import (
    CondenseQuestionRequest,
    CondenseQuestionResponse,
    ConversationTitleRequest,
    ConversationTitleResponse,
    GenerateRequest,
    GenerateResponse,
)
from llm.service import (
    condense_question,
    generate_answer,
    generate_conversation_title,
)

router = APIRouter()


@router.get("/health")
async def health() -> HealthResponse:
    """Comprueba que el servicio LLM está disponible."""
    return HealthResponse()


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


@router.post(
    "/condense-question",
    responses={
        500: {"description": "Error interno al reformular la pregunta."},
        502: {"description": "Servicio LLM no disponible o respuesta inválida."},
        504: {"description": "El LLM tardó demasiado en responder."},
    },
)
async def condense_question_endpoint(
    payload: CondenseQuestionRequest,
    client: HttpClient,
) -> CondenseQuestionResponse:
    """
    Reformula una pregunta contextual para recuperar chunks más relevantes.

    Args:
        payload (CondenseQuestionRequest): Pregunta actual e historial reciente.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        CondenseQuestionResponse: Pregunta independiente para el retriever.
    """
    return CondenseQuestionResponse(**await condense_question(payload=payload, client=client))


@router.post(
    "/conversation-title",
    responses={
        500: {"description": "Error interno al generar el título."},
        502: {"description": "Servicio LLM no disponible o respuesta inválida."},
        504: {"description": "El LLM tardó demasiado en responder."},
    },
)
async def conversation_title_endpoint(
    payload: ConversationTitleRequest,
    client: HttpClient,
) -> ConversationTitleResponse:
    """
    Genera un título corto para una conversación persistente.

    Args:
        payload (ConversationTitleRequest): Mensajes recientes de la conversación.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        ConversationTitleResponse: Título corto y limpio.
    """
    return ConversationTitleResponse(
        **await generate_conversation_title(payload=payload, client=client)
    )
