"""Orquestación de recuperación RAG y respuesta LLM por juego."""

from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.auth.service import AuthenticatedSession
from api.exceptions import InternalServiceError
from api.manuals.repository import load_authorized_chunks
from api.manuals.retrieval.deduplication import deduplicate_chunks
from api.manuals.schemas import AnswerResponse, GameQuestionRequest


async def answer_game_question(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
    payload: GameQuestionRequest,
    client: httpx.AsyncClient,
) -> AnswerResponse:
    """Responde una pregunta usando chunks autorizados de un juego."""
    retrieval_response = await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/retrieve",
        payload={
            "game_id": str(game_id),
            "question": payload.question,
            "top_k": payload.top_k * config.RAG_RETRIEVAL_MULTIPLIER,
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail="Error interno al recuperar el contexto del juego.",
    )
    chunk_ids = _parse_retrieved_chunk_ids(retrieval_response)
    authorized_chunks = await load_authorized_chunks(
        session,
        game_id=game_id,
        current_user_id=auth.user.id,
        chunk_ids=chunk_ids,
    )
    context_chunks = [
        chunk.text for chunk in deduplicate_chunks(authorized_chunks)[: payload.top_k]
    ]
    llm_response = await internal_client.post_json(
        client=client,
        service_name="LLM",
        url=f"{config.LLM_URL}/generate",
        payload={
            "question": payload.question,
            "context_chunks": context_chunks,
        },
        unavailable_detail="Servicio LLM no disponible.",
        internal_detail="Error interno al generar la respuesta.",
    )
    return AnswerResponse(answer=str(llm_response["answer"]))


def _parse_retrieved_chunk_ids(response: dict) -> list[UUID]:
    """Valida IDs devueltos por RAG antes de consultar Postgres."""
    try:
        return [UUID(str(chunk["id"])) for chunk in response["chunks"]]
    except (KeyError, TypeError, ValueError) as retrieval_err:
        raise InternalServiceError(
            "Error interno al recuperar el contexto del juego."
        ) from retrieval_err
