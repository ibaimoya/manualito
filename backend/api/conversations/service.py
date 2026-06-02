"""Casos de uso de conversaciones persistentes."""

import logging
from collections.abc import Mapping, Sequence
from uuid import UUID

import httpx
from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.auth.service import AuthenticatedSession
from api.conversations import repository
from api.conversations.exceptions import ConversationNotFoundError
from api.conversations.schemas import (
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.games.exceptions import GameUnavailableError
from api.manuals.retrieval.service import generate_game_answer
from common.conversation_limits import (
    CONVERSATION_TITLE_MAX_LENGTH,
)
from database.session import get_sessionmaker

logger = logging.getLogger(__name__)


async def create_conversation(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
) -> ConversationResponse:
    """Crea una conversación vacía para un juego."""
    row = await repository.create_user_conversation(
        session,
        user_id=auth.user.id,
        game_id=game_id,
    )
    return ConversationResponse.model_validate(row)


async def list_conversations(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
    limit: int,
    offset: int,
) -> list[ConversationResponse]:
    """Lista conversaciones propias de un juego."""
    rows = await repository.list_game_conversations(
        session,
        user_id=auth.user.id,
        game_id=game_id,
        limit=limit,
        offset=offset,
    )
    return [ConversationResponse.model_validate(row) for row in rows]


async def list_messages(
    session: AsyncSession,
    *,
    conversation_id: UUID,
    limit: int,
    offset: int,
) -> list[MessageResponse]:
    """Lista mensajes de una conversación ya autorizada."""
    messages = await repository.list_conversation_messages(
        session,
        conversation_id=conversation_id,
        limit=limit,
        offset=offset,
    )
    return [MessageResponse.model_validate(message) for message in messages]


async def send_message(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    conversation_id: UUID,
    payload: SendMessageRequest,
    client: httpx.AsyncClient,
    background_tasks: BackgroundTasks,
) -> SendMessageResponse:
    """Genera y persiste un turno completo de conversación."""
    user_content = payload.content.strip()
    context = await _load_turn_context(
        session,
        user_id=auth.user.id,
        conversation_id=conversation_id,
    )
    history_payload = _history_payload(context.history)
    retrieval_question = await _build_retrieval_question(
        client=client,
        question=user_content,
        history=history_payload,
    )
    answer = await generate_game_answer(
        session,
        auth=auth,
        game_id=context.game_id,
        question=user_content,
        top_k=payload.top_k,
        client=client,
        chat_history=history_payload,
        retrieval_question=retrieval_question,
    )
    fallback_title = _fallback_title(user_content) if context.title is None else None
    stored = await repository.append_message_pair(
        session,
        user_id=auth.user.id,
        conversation_id=context.id,
        user_content=user_content,
        assistant_content=answer.answer,
        title=fallback_title,
    )
    response = SendMessageResponse(
        conversation=ConversationResponse.model_validate(stored.conversation),
        user_message=MessageResponse.model_validate(stored.user_message),
        assistant_message=MessageResponse.model_validate(stored.assistant_message),
    )
    await session.rollback()
    if fallback_title is not None:
        _schedule_title_refresh(
            background_tasks,
            user_id=auth.user.id,
            conversation_id=context.id,
            expected_title=fallback_title,
            question=user_content,
            answer=answer.answer,
            history=history_payload,
            client=client,
        )
    return response


async def delete_conversation(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    conversation_id: UUID,
) -> None:
    """Borra lógicamente una conversación propia."""
    await repository.soft_delete_conversation(
        session,
        user_id=auth.user.id,
        conversation_id=conversation_id,
    )


async def _load_turn_context(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> repository.ConversationTurnContext:
    """Carga el snapshot del turno y libera la transacción de lectura."""
    try:
        return await repository.load_conversation_turn_context(
            session,
            user_id=user_id,
            conversation_id=conversation_id,
            history_limit=config.CONVERSATION_HISTORY_MESSAGES,
        )
    finally:
        await session.rollback()


async def _build_retrieval_question(
    *,
    client: httpx.AsyncClient,
    question: str,
    history: Sequence[Mapping[str, str]],
) -> str:
    """Reformula la pregunta para recuperar contexto si hay historial."""
    if not history:
        return question

    try:
        response = await internal_client.post_json(
            client=client,
            service_name="LLM",
            url=f"{config.LLM_URL}/condense-question",
            payload={"question": question, "chat_history": list(history)},
            unavailable_detail="Servicio LLM no disponible.",
            internal_detail="Error interno al reformular la pregunta.",
        )
    except (InternalServiceError, InternalServiceUnavailableError):
        logger.warning("No se pudo reformular la pregunta; se usa la original.")
        return question

    condensed = str(response.get("question", "")).strip()
    return condensed or question


def _schedule_title_refresh(
    background_tasks: BackgroundTasks,
    *,
    user_id: UUID,
    conversation_id: UUID,
    expected_title: str,
    question: str,
    answer: str,
    history: Sequence[Mapping[str, str]],
    client: httpx.AsyncClient,
) -> None:
    """Agenda el título refinado fuera del camino crítico del turno."""
    background_tasks.add_task(
        _refresh_conversation_title,
        user_id=user_id,
        conversation_id=conversation_id,
        expected_title=expected_title,
        question=question,
        answer=answer,
        history=list(history),
        client=client,
    )


async def _refresh_conversation_title(
    *,
    user_id: UUID,
    conversation_id: UUID,
    expected_title: str,
    question: str,
    answer: str,
    history: Sequence[Mapping[str, str]],
    client: httpx.AsyncClient,
) -> None:
    """Refina el título con sesión propia y sin bloquear la respuesta."""
    title = await _conversation_title(
        client=client,
        current_title=None,
        question=question,
        answer=answer,
        history=history,
    )
    if title is None or title == expected_title:
        return

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            await repository.update_conversation_title(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                expected_title=expected_title,
                title=title,
            )
        except (ConversationNotFoundError, GameUnavailableError):
            logger.info(
                "Título descartado porque la conversación ya no admite cambios: %s.",
                conversation_id,
            )


async def _conversation_title(
    *,
    client: httpx.AsyncClient,
    current_title: str | None,
    question: str,
    answer: str,
    history: Sequence[Mapping[str, str]],
) -> str | None:
    """Genera título solo cuando la conversación todavía no lo tiene."""
    if current_title is not None:
        return None

    messages = [
        *history,
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]
    try:
        response = await internal_client.post_json(
            client=client,
            service_name="LLM",
            url=f"{config.LLM_URL}/conversation-title",
            payload={"messages": messages},
            unavailable_detail="Servicio LLM no disponible.",
            internal_detail="Error interno al generar el título.",
        )
    except (InternalServiceError, InternalServiceUnavailableError):
        logger.warning("No se pudo generar título; se usa fallback local.")
        return _fallback_title(question)

    return _clean_title(str(response.get("title", ""))) or _fallback_title(question)


def _history_payload(
    messages: Sequence[repository.MessageSnapshot],
) -> list[dict[str, str]]:
    """Convierte snapshots de mensajes en el contrato interno del LLM."""
    return [{"role": message.role, "content": message.content} for message in messages]


def _fallback_title(question: str) -> str:
    """Crea un título local cuando el LLM no devuelve uno usable."""
    first_line = question.strip().splitlines()[0]
    return _clean_title(first_line) or "Nueva conversación"


def _clean_title(title: str) -> str:
    """Limpia comillas, saltos de línea y longitud máxima del título."""
    lines = title.strip().strip("\"'`").splitlines()
    if not lines:
        return ""
    cleaned = lines[0].strip()
    if len(cleaned) <= CONVERSATION_TITLE_MAX_LENGTH:
        return cleaned
    return f"{cleaned[: CONVERSATION_TITLE_MAX_LENGTH - 3].rstrip()}..."
