"""Casos de uso de conversaciones persistentes."""

import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from uuid import UUID

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.auth.service import AuthenticatedSession
from api.conversations import repository
from api.conversations.exceptions import ConversationNotFoundError, NoManualSourcesError
from api.conversations.schemas import (
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.games import repository as games_repository
from api.games.exceptions import GameUnavailableError
from api.locks import advisory_session_lock
from api.manuals.exceptions import GeneratedAnswerTooLongError
from api.manuals.retrieval.service import generate_game_answer
from common.conversation_limits import CONVERSATION_TITLE_MAX_LENGTH
from database.session import get_sessionmaker

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ConversationTitleJob:
    """Datos opacos para refinar el título de una conversación."""

    user_id: UUID
    conversation_id: UUID
    user_message_id: UUID
    expected_title: str


@dataclass(frozen=True, slots=True)
class SendMessageOutcome:
    """Respuesta HTTP y trabajo opcional derivado del turno."""

    response: SendMessageResponse
    title_job: ConversationTitleJob | None


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
) -> SendMessageOutcome:
    """Persiste un turno pendiente y deja la generación al worker GPU."""
    # Copia plana antes del primer rollback: el rollback expira auth.user y
    # tocarlo después dispararía un lazy-load síncrono (MissingGreenlet).
    user_id = auth.user.id
    user_content = payload.content.strip()
    context = await _load_turn_context(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    await _ensure_game_has_sources(session, user_id=user_id, game_id=context.game_id)
    fallback_title = _fallback_title(user_content) if context.title is None else None
    stored = await repository.append_pending_message_pair(
        session,
        user_id=user_id,
        conversation_id=context.id,
        user_content=user_content,
        title=fallback_title,
    )
    try:
        await games_repository.auto_follow_game(
            session,
            user_id=user_id,
            game_id=context.game_id,
        )
    except SQLAlchemyError:
        await session.rollback()
        logger.warning("No se pudo auto-seguir el juego tras enviar mensaje.", exc_info=True)
    response = SendMessageResponse(
        conversation=ConversationResponse.model_validate(stored.conversation),
        user_message=MessageResponse.model_validate(stored.user_message),
        assistant_message=MessageResponse.model_validate(stored.assistant_message),
    )
    await session.rollback()
    title_job = (
        ConversationTitleJob(
            user_id=user_id,
            conversation_id=context.id,
            user_message_id=stored.user_message.id,
            expected_title=fallback_title,
        )
        if fallback_title is not None
        else None
    )
    return SendMessageOutcome(response=response, title_job=title_job)


async def generate_pending_reply(
    user_id: UUID,
    conversation_id: UUID,
    user_message_id: UUID,
    assistant_message_id: UUID,
    top_k: int,
) -> bool:
    """Completa una respuesta pendiente bajo lock por conversación."""
    async with advisory_session_lock(f"conversation:{conversation_id}") as session:
        if session is None:
            return False

        try:
            context = await repository.load_pending_reply_context(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                user_message_id=user_message_id,
                assistant_message_id=assistant_message_id,
                history_limit=config.CONVERSATION_HISTORY_MESSAGES,
            )
            if context is None:
                return True
            history_payload = _history_payload(context.history)
            async with httpx.AsyncClient(timeout=config.INTERNAL_JSON_TIMEOUT) as client:
                retrieval_question = await _build_retrieval_question(
                    client=client,
                    question=context.user_message_content,
                    history=history_payload,
                )
                answer = await generate_game_answer(
                    session,
                    current_user_id=user_id,
                    game_id=context.game_id,
                    question=context.user_message_content,
                    top_k=top_k,
                    client=client,
                    chat_history=history_payload,
                    retrieval_question=retrieval_question,
                )
            await repository.complete_assistant_message(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                assistant_message_id=assistant_message_id,
                content=answer.answer,
                sources=[source.model_dump(mode="json") for source in answer.sources],
            )
            return True
        except (ConversationNotFoundError, GameUnavailableError):
            logger.info(
                "Respuesta descartada porque la conversación ya no admite cambios: %s.",
                conversation_id,
            )
            return True
        except GeneratedAnswerTooLongError:
            await _fail_pending_reply(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                assistant_message_id=assistant_message_id,
                error_code="answer_too_long",
            )
            return True
        except (InternalServiceError, InternalServiceUnavailableError):
            logger.warning("No se pudo generar una respuesta de chat.", exc_info=True)
            await _fail_pending_reply(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                assistant_message_id=assistant_message_id,
                error_code="generation_failed",
            )
            return True


async def fail_pending_reply(
    user_id: UUID,
    conversation_id: UUID,
    assistant_message_id: UUID,
    error_code: str,
) -> None:
    """Marca un mensaje provisional de asistente como fallido desde Celery."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await _fail_pending_reply(
            session,
            user_id=user_id,
            conversation_id=conversation_id,
            assistant_message_id=assistant_message_id,
            error_code=error_code,
        )


async def rename_conversation(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    conversation_id: UUID,
    title: str,
) -> ConversationResponse:
    """Renombra una conversación propia con el título elegido por el usuario."""
    row = await repository.rename_user_conversation(
        session,
        user_id=auth.user.id,
        conversation_id=conversation_id,
        title=title,
    )
    return ConversationResponse.model_validate(row)


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


async def _ensure_game_has_sources(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> None:
    """Bloquea preguntar si el juego ya no tiene manuales que citar."""
    try:
        has_sources = await games_repository.game_pool_has_manuals(
            session,
            game_id=game_id,
            current_user_id=user_id,
        )
    finally:
        await session.rollback()
    if not has_sources:
        raise NoManualSourcesError


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


async def refresh_conversation_title(
    user_id: UUID,
    conversation_id: UUID,
    user_message_id: UUID,
    expected_title: str,
) -> None:
    """Refina el título con sesión propia y sin bloquear la respuesta."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            context = await repository.load_conversation_title_context(
                session,
                user_id=user_id,
                conversation_id=conversation_id,
                user_message_id=user_message_id,
                history_limit=config.CONVERSATION_HISTORY_MESSAGES,
            )
        except (ConversationNotFoundError, GameUnavailableError):
            logger.info(
                "Título descartado porque la conversación ya no admite cambios: %s.",
                conversation_id,
            )
            return
        finally:
            await session.rollback()

    async with httpx.AsyncClient(timeout=config.INTERNAL_JSON_TIMEOUT) as client:
        title = await _conversation_title(
            client=client,
            current_title=None,
            game_name=context.game_name,
            question=context.question,
            history=_history_payload(context.history),
        )
    if title is None or title == expected_title:
        return

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
    game_name: str,
    question: str,
    history: Sequence[Mapping[str, str]],
) -> str | None:
    """Genera título solo cuando la conversación todavía no lo tiene."""
    if current_title is not None:
        return None

    messages = [
        *history,
        {"role": "user", "content": question},
    ]
    try:
        response = await internal_client.post_json(
            client=client,
            service_name="LLM",
            url=f"{config.LLM_URL}/conversation-title",
            payload={"game_name": game_name, "messages": messages},
            unavailable_detail="Servicio LLM no disponible.",
            internal_detail="Error interno al generar el título.",
        )
    except (InternalServiceError, InternalServiceUnavailableError):
        logger.warning("No se pudo generar título; se usa fallback local.")
        return _fallback_title(question)

    return _clean_title(str(response.get("title", ""))) or _fallback_title(question)


async def _fail_pending_reply(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
    assistant_message_id: UUID,
    error_code: str,
) -> None:
    try:
        await repository.fail_assistant_message(
            session,
            user_id=user_id,
            conversation_id=conversation_id,
            assistant_message_id=assistant_message_id,
            error_code=error_code,
        )
    except (ConversationNotFoundError, GameUnavailableError):
        logger.info(
            "No se pudo marcar como fallida una respuesta ya obsoleta: %s.",
            assistant_message_id,
        )


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
