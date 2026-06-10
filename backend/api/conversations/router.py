"""Endpoints de conversaciones persistentes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status

from api import config
from api.annotations import DbSession, HttpClient
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.conversations.dependencies import valid_conversation
from api.conversations.schemas import (
    CONVERSATION_LIST_LIMIT_DEFAULT,
    CONVERSATION_LIST_LIMIT_MAX,
    CONVERSATION_MESSAGE_LIST_LIMIT_DEFAULT,
    CONVERSATION_MESSAGE_LIST_LIMIT_MAX,
    ConversationListResponse,
    ConversationResponse,
    MessageListResponse,
    RenameConversationRequest,
    SendMessageRequest,
    SendMessageResponse,
)
from api.conversations.service import (
    create_conversation,
    delete_conversation,
    list_conversations,
    list_messages,
    rename_conversation,
    send_message,
)
from api.games.dependencies import ValidGameId
from api.rate_limit import limiter
from api.responses import (
    CONVERSATION_NOT_FOUND_RESPONSE,
    GAME_NOT_FOUND_RESPONSE,
    GAME_UNAVAILABLE_RESPONSE,
    GENERATED_ANSWER_TOO_LONG_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
)

router = APIRouter()

ConversationListLimit = Annotated[
    int,
    Query(ge=1, le=CONVERSATION_LIST_LIMIT_MAX),
]
ConversationListOffset = Annotated[int, Query(ge=0)]
MessageListLimit = Annotated[
    int,
    Query(ge=1, le=CONVERSATION_MESSAGE_LIST_LIMIT_MAX),
]
MessageListOffset = Annotated[int, Query(ge=0)]


@router.get(
    "/api/games/{game_id}/conversations",
    responses=GAME_NOT_FOUND_RESPONSE,
)
async def list_game_conversations_handler(
    auth: CurrentAuth,
    game_id: ValidGameId,
    session: DbSession,
    limit: ConversationListLimit = CONVERSATION_LIST_LIMIT_DEFAULT,
    offset: ConversationListOffset = 0,
) -> ConversationListResponse:
    """Lista conversaciones propias de un juego."""
    conversations = await list_conversations(
        session,
        auth=auth,
        game_id=game_id,
        limit=limit,
        offset=offset,
    )
    return ConversationListResponse(conversations=conversations)


@router.post(
    "/api/games/{game_id}/conversations",
    status_code=status.HTTP_201_CREATED,
    responses=GAME_NOT_FOUND_RESPONSE,
)
@limiter.limit(config.CONVERSATION_CREATE_RATE_LIMIT)
async def create_game_conversation_handler(
    request: Request,
    auth: CurrentAuth,
    game_id: ValidGameId,
    session: DbSession,
    _csrf: CsrfProtection,
) -> ConversationResponse:
    """Crea una conversación vacía sobre un juego."""
    return await create_conversation(session, auth=auth, game_id=game_id)


@router.get(
    "/api/conversations/{conversation_id}/messages",
    responses=CONVERSATION_NOT_FOUND_RESPONSE,
    dependencies=[Depends(valid_conversation)],
)
async def list_conversation_messages_handler(
    conversation_id: UUID,
    session: DbSession,
    limit: MessageListLimit = CONVERSATION_MESSAGE_LIST_LIMIT_DEFAULT,
    offset: MessageListOffset = 0,
) -> MessageListResponse:
    """Lista mensajes de una conversación propia."""
    messages = await list_messages(
        session,
        conversation_id=conversation_id,
        limit=limit,
        offset=offset,
    )
    return MessageListResponse(messages=messages)


@router.post(
    "/api/conversations/{conversation_id}/messages",
    responses={
        **CONVERSATION_NOT_FOUND_RESPONSE,
        **GAME_UNAVAILABLE_RESPONSE,
        **GENERATED_ANSWER_TOO_LONG_RESPONSE,
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
@limiter.limit(config.CONVERSATION_MESSAGE_RATE_LIMIT)
async def send_conversation_message_handler(
    request: Request,
    auth: CurrentAuth,
    conversation_id: UUID,
    payload: SendMessageRequest,
    session: DbSession,
    client: HttpClient,
    background_tasks: BackgroundTasks,
    _csrf: CsrfProtection,
) -> SendMessageResponse:
    """Envía un mensaje, genera respuesta y persiste el turno completo."""
    return await send_message(
        session,
        auth=auth,
        conversation_id=conversation_id,
        payload=payload,
        client=client,
        background_tasks=background_tasks,
    )


@router.patch(
    "/api/conversations/{conversation_id}",
    responses=CONVERSATION_NOT_FOUND_RESPONSE,
)
@limiter.limit(config.CONVERSATION_RENAME_RATE_LIMIT)
async def rename_conversation_handler(
    request: Request,
    auth: CurrentAuth,
    conversation_id: UUID,
    payload: RenameConversationRequest,
    session: DbSession,
    _csrf: CsrfProtection,
) -> ConversationResponse:
    """Renombra una conversación propia."""
    return await rename_conversation(
        session,
        auth=auth,
        conversation_id=conversation_id,
        title=payload.title,
    )


@router.delete(
    "/api/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=CONVERSATION_NOT_FOUND_RESPONSE,
)
async def delete_conversation_handler(
    conversation_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> None:
    """Borra lógicamente una conversación propia."""
    await delete_conversation(
        session,
        auth=auth,
        conversation_id=conversation_id,
    )
