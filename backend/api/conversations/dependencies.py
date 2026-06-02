"""Dependencias reutilizables de conversaciones."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends

from api.annotations import DbSession
from api.auth.dependencies import CurrentAuth
from api.conversations.repository import get_owned_conversation
from database.models.conversation import Conversation


async def valid_conversation(
    conversation_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
) -> Conversation:
    """Devuelve una conversación propia o lanza 404 estable."""
    return await get_owned_conversation(
        session,
        user_id=auth.user.id,
        conversation_id=conversation_id,
    )


ValidConversation = Annotated[Conversation, Depends(valid_conversation)]
