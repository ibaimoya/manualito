"""Consultas SQL de conversaciones y mensajes."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.conversations.exceptions import ConversationNotFoundError
from api.games.exceptions import GameUnavailableError
from database.models.conversation import Conversation, Message
from database.models.game import Game


@dataclass(frozen=True, slots=True)
class MessageSnapshot:
    """Mensaje desacoplado de la sesión para construir prompts."""

    role: str
    content: str


@dataclass(frozen=True, slots=True)
class ConversationTurnContext:
    """Datos mínimos de una conversación antes de llamar al LLM."""

    id: UUID
    user_id: UUID
    game_id: UUID
    title: str | None
    history: tuple[MessageSnapshot, ...]


@dataclass(frozen=True, slots=True)
class StoredMessagePair:
    """Mensajes creados en un turno completo."""

    user_message: Message
    assistant_message: Message
    conversation: Row


async def create_user_conversation(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> Row:
    """Crea una conversación vacía asociada a un juego activo."""
    conversation = Conversation(user_id=user_id, game_id=game_id)
    session.add(conversation)
    await session.flush()
    await session.commit()
    return await get_conversation_summary(
        session,
        user_id=user_id,
        conversation_id=conversation.id,
    )


async def list_game_conversations(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    limit: int,
    offset: int,
) -> list[Row]:
    """Lista conversaciones propias de un juego por actividad reciente."""
    result = await session.execute(
        _conversation_summary_query(user_id)
        .where(Conversation.game_id == game_id)
        .limit(limit)
        .offset(offset)
    )
    return list(result)


async def get_owned_conversation(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> Conversation:
    """Carga una conversación propia con ownership dentro del WHERE."""
    result = await session.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise ConversationNotFoundError
    return conversation


async def load_conversation_turn_context(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
    history_limit: int,
) -> ConversationTurnContext:
    """Carga conversación activa e historial como snapshot de solo lectura."""
    conversation = await _get_owned_conversation_with_game_state(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    _ensure_game_available(conversation.game_status, conversation.game_deleted_at)
    history = await load_recent_messages(
        session,
        conversation_id=conversation.conversation.id,
        limit=history_limit,
    )
    return ConversationTurnContext(
        id=conversation.conversation.id,
        user_id=conversation.conversation.user_id,
        game_id=conversation.conversation.game_id,
        title=conversation.conversation.title,
        history=tuple(
            MessageSnapshot(message.role, message.content) for message in history
        ),
    )


async def get_conversation_summary(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> Row:
    """Devuelve el resumen público de una conversación propia."""
    result = await session.execute(
        _conversation_summary_query(user_id).where(Conversation.id == conversation_id)
    )
    row = result.one_or_none()
    if row is None:
        raise ConversationNotFoundError
    return row


async def list_conversation_messages(
    session: AsyncSession,
    *,
    conversation_id: UUID,
    limit: int,
    offset: int,
) -> list[Message]:
    """Lista mensajes de una conversación ya autorizada."""
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars())


async def load_recent_messages(
    session: AsyncSession,
    *,
    conversation_id: UUID,
    limit: int,
) -> list[Message]:
    """Carga los últimos mensajes para condicionar el siguiente turno."""
    if limit <= 0:
        return []

    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(limit)
    )
    return list(reversed(list(result.scalars())))


async def append_message_pair(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
    user_content: str,
    assistant_content: str,
    assistant_sources: Sequence[Mapping[str, object]],
    title: str | None,
) -> StoredMessagePair:
    """Guarda usuario y asistente en un commit corto tras el LLM."""
    conversation = await _get_active_conversation_for_write(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=user_content,
        sources=[],
    )
    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=assistant_content,
        sources=list(assistant_sources),
    )
    if conversation.title is None and title is not None:
        conversation.title = title
    conversation.updated_at = func.now()

    session.add_all([user_message, assistant_message])
    await session.flush()
    await session.commit()
    return StoredMessagePair(
        user_message=user_message,
        assistant_message=assistant_message,
        conversation=await get_conversation_summary(
            session,
            user_id=conversation.user_id,
            conversation_id=conversation.id,
        ),
    )


async def update_conversation_title(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
    expected_title: str,
    title: str,
) -> None:
    """Actualiza el título si nadie lo cambió desde el fallback inicial."""
    conversation = await _get_active_conversation_for_write(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    if conversation.title != expected_title:
        await session.rollback()
        return
    conversation.title = title
    conversation.updated_at = func.now()
    await session.commit()


async def soft_delete_conversation(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> None:
    """Marca una conversación propia como borrada."""
    conversation = await get_owned_conversation(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    deleted_at = func.now()
    conversation.deleted_at = deleted_at
    conversation.updated_at = deleted_at
    await session.commit()


def _conversation_summary_query(user_id: UUID) -> Select:
    """Construye la query base de conversaciones propias."""
    return (
        select(
            Conversation.id,
            Conversation.game_id,
            Game.name.label("game_name"),
            Conversation.title,
            Conversation.created_at,
            Conversation.updated_at,
        )
        .join(Game, Game.id == Conversation.game_id)
        .where(
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    )


@dataclass(frozen=True, slots=True)
class _ConversationWithGameState:
    """Resultado interno para distinguir 404 de juego no disponible."""

    conversation: Conversation
    game_status: str
    game_deleted_at: datetime | None


async def _get_owned_conversation_with_game_state(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> _ConversationWithGameState:
    """Carga conversación propia junto al estado actual de su juego."""
    result = await session.execute(
        select(
            Conversation,
            Game.status.label("game_status"),
            Game.deleted_at.label("game_deleted_at"),
        )
        .join(Game, Game.id == Conversation.game_id)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
    )
    row = result.one_or_none()
    if row is None:
        raise ConversationNotFoundError
    return _ConversationWithGameState(
        conversation=row[0],
        game_status=row.game_status,
        game_deleted_at=row.game_deleted_at,
    )


async def _get_active_conversation_for_write(
    session: AsyncSession,
    *,
    user_id: UUID,
    conversation_id: UUID,
) -> Conversation:
    """Revalida ownership y disponibilidad del juego antes de escribir."""
    conversation = await _get_owned_conversation_with_game_state(
        session,
        user_id=user_id,
        conversation_id=conversation_id,
    )
    _ensure_game_available(conversation.game_status, conversation.game_deleted_at)
    return conversation.conversation


def _ensure_game_available(game_status: str, game_deleted_at: datetime | None) -> None:
    """Bloquea nuevos turnos si el juego ya no está activo."""
    if game_status != "active" or game_deleted_at is not None:
        raise GameUnavailableError
