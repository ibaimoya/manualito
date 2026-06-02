"""Schemas públicos de conversaciones."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from api.schemas import StrictModel
from database.models.constants import USER_MESSAGE_MAX_LENGTH

CONVERSATION_LIST_LIMIT_DEFAULT = 50
CONVERSATION_LIST_LIMIT_MAX = 100
CONVERSATION_MESSAGE_LIST_LIMIT_DEFAULT = 100
CONVERSATION_MESSAGE_LIST_LIMIT_MAX = 200
CONVERSATION_MESSAGE_TOP_K_DEFAULT = 5
CONVERSATION_MESSAGE_TOP_K_MAX = 10
MessageContent = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=USER_MESSAGE_MAX_LENGTH,
    ),
]


class ConversationResponse(StrictModel):
    """Resumen de una conversación visible para el usuario."""

    id: UUID
    game_id: UUID
    game_name: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(StrictModel):
    """Listado paginado de conversaciones de un juego."""

    conversations: list[ConversationResponse]


class MessageResponse(StrictModel):
    """Mensaje persistido dentro de una conversación."""

    id: UUID
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class MessageListResponse(StrictModel):
    """Listado paginado de mensajes de una conversación."""

    messages: list[MessageResponse]


class SendMessageRequest(StrictModel):
    """Pregunta del usuario dentro de una conversación existente."""

    content: MessageContent
    top_k: int = Field(
        default=CONVERSATION_MESSAGE_TOP_K_DEFAULT,
        ge=1,
        le=CONVERSATION_MESSAGE_TOP_K_MAX,
    )


class SendMessageResponse(StrictModel):
    """Respuesta tras guardar el turno completo de conversación."""

    conversation: ConversationResponse
    user_message: MessageResponse
    assistant_message: MessageResponse
