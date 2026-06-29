"""DTOs internos de conversaciones."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ConversationSummary:
    """Resumen de conversación leído desde Postgres."""

    id: UUID
    game_id: UUID
    game_name: str
    title: str | None
    created_at: datetime
    updated_at: datetime
    has_pending_reply: bool


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
    game_name: str
    title: str | None
    history: tuple[MessageSnapshot, ...]


@dataclass(frozen=True, slots=True)
class PendingReplyContext:
    """Datos necesarios para completar una respuesta pendiente."""

    id: UUID
    user_id: UUID
    game_id: UUID
    game_name: str
    title: str | None
    user_message_content: str
    history: tuple[MessageSnapshot, ...]


@dataclass(frozen=True, slots=True)
class ConversationTitleContext:
    """Datos mínimos para refinar el título fuera de la petición HTTP."""

    game_name: str
    question: str
    history: tuple[MessageSnapshot, ...]


@dataclass(frozen=True, slots=True)
class StoredMessage:
    """Mensaje persistido sin depender de una sesión viva."""

    id: UUID
    role: str
    status: str
    content: str
    created_at: datetime
    sources: list[dict[str, object]]
    error_code: str | None


@dataclass(frozen=True, slots=True)
class StoredMessagePair:
    """Mensajes creados en un turno de conversación."""

    user_message: StoredMessage
    assistant_message: StoredMessage
    conversation: ConversationSummary


@dataclass(frozen=True, slots=True)
class ConversationTitleJob:
    """Datos opacos para refinar el título de una conversación."""

    user_id: UUID
    conversation_id: UUID
    user_message_id: UUID
    expected_title: str


@dataclass(frozen=True, slots=True)
class SendMessageOutcome:
    """Turno persistido y trabajo opcional derivado."""

    conversation: ConversationSummary
    user_message: StoredMessage
    assistant_message: StoredMessage
    title_job: ConversationTitleJob | None
