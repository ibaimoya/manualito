"""Orquestación de recuperación RAG y respuesta LLM por juego."""

from collections.abc import Mapping, Sequence
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.exceptions import InternalServiceError
from api.manuals.dto import AuthorizedChunk
from api.manuals.exceptions import GeneratedAnswerTooLongError, ManualContextNotFoundError
from api.manuals.repository import load_authorized_chunks, load_game_retrieval_context
from api.manuals.retrieval.deduplication import deduplicate_chunks
from api.manuals.schemas import AnswerResponse, AnswerSource
from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from common.language import Language


async def generate_game_answer(
    session: AsyncSession,
    *,
    current_user_id: UUID,
    game_id: UUID,
    question: str,
    top_k: int,
    client: httpx.AsyncClient,
    chat_history: Sequence[Mapping[str, str]] = (),
    retrieval_question: str | None = None,
    language: Language = "es",
) -> AnswerResponse:
    """Genera una respuesta RAG usando los manuales autorizados del juego.

    Args:
        session (AsyncSession): Sesión activa de la petición.
        current_user_id (UUID): Usuario que realiza la pregunta.
        game_id (UUID): Juego sobre el que se consulta.
        question (str): Pregunta original enviada al LLM.
        top_k (int): Número máximo de fragmentos usados como contexto.
        client (httpx.AsyncClient): Cliente para los servicios internos.
        chat_history (Sequence[Mapping[str, str]]): Historial enviado al LLM.
        retrieval_question (str | None): Pregunta optimizada para la búsqueda.
        language (Language): Idioma solicitado para la respuesta.

    Returns:
        AnswerResponse: Respuesta generada con sus fuentes autorizadas.

    Raises:
        ManualContextNotFoundError: Si no existen manuales autorizados.
        InternalServiceError: Si RAG devuelve identificadores inválidos.
        GeneratedAnswerTooLongError: Si la respuesta supera el límite permitido.
    """
    game_name, manual_ids = await load_game_retrieval_context(
        session,
        game_id=game_id,
        current_user_id=current_user_id,
    )
    await session.rollback()
    if not manual_ids:
        raise ManualContextNotFoundError
    search_question = f"Manual de {game_name}: {retrieval_question or question}"
    retrieval_response = await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/retrieve",
        payload={
            "game_id": str(game_id),
            "manual_ids": [str(manual_id) for manual_id in manual_ids],
            "question": search_question,
            "top_k": top_k,
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail="Error interno al recuperar el contexto del juego.",
    )
    chunk_ids = _parse_retrieved_chunk_ids(retrieval_response)
    try:
        authorized_chunks = await load_authorized_chunks(
            session,
            game_id=game_id,
            current_user_id=current_user_id,
            chunk_ids=chunk_ids,
        )
        context = deduplicate_chunks(authorized_chunks)[:top_k]
        context_chunks = [chunk.text for chunk in context]
        sources = _answer_sources(context)
    finally:
        await session.rollback()

    llm_response = await internal_client.post_json(
        client=client,
        service_name="LLM",
        url=f"{config.LLM_URL}/generate",
        payload={
            "question": question,
            "context_chunks": context_chunks,
            "chat_history": list(chat_history),
            "game_name": game_name,
            "language": language,
        },
        unavailable_detail="Servicio LLM no disponible.",
        internal_detail="Error interno al generar la respuesta.",
    )
    answer = str(llm_response["answer"])
    if len(answer) > MESSAGE_CONTENT_MAX_LENGTH:
        raise GeneratedAnswerTooLongError
    return AnswerResponse(answer=answer, sources=sources)


def _parse_retrieved_chunk_ids(response: Mapping[str, object]) -> list[UUID]:
    """Valida IDs devueltos por RAG antes de consultar Postgres."""
    try:
        chunks = response["chunks"]
        if not isinstance(chunks, list) or not all(isinstance(chunk, Mapping) for chunk in chunks):
            raise TypeError
        return [UUID(str(chunk["id"])) for chunk in chunks]
    except (KeyError, TypeError, ValueError) as retrieval_err:
        raise InternalServiceError(
            "Error interno al recuperar el contexto del juego."
        ) from retrieval_err


def _answer_sources(chunks: Sequence[AuthorizedChunk]) -> list[AnswerSource]:
    """Devuelve fuentes únicas por manual y página preservando el orden."""
    seen: set[tuple[UUID, int]] = set()
    sources: list[AnswerSource] = []
    for chunk in chunks:
        key = (chunk.manual_id, chunk.source_page)
        if key in seen:
            continue
        seen.add(key)
        sources.append(
            AnswerSource(
                manual_id=chunk.manual_id,
                manual_title=chunk.manual_title,
                page=chunk.source_page,
                is_own=chunk.is_own,
            )
        )
    return sources
