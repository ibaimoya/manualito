from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Literal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.service import AuthenticatedSession
from api.conversations.dependencies import valid_conversation
from api.conversations.exceptions import ConversationNotFoundError
from api.conversations.schemas import (
    ConversationResponse,
    MessageResponse,
    SendMessageResponse,
)
from api.games.dependencies import valid_game_id
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.constants import USER_MESSAGE_MAX_LENGTH
from database.models.conversation import Conversation
from database.models.user import User
from database.session import get_db_session

_FAKE_HASH = "hash-value"
_FAKE_SESSION_HASH = "a" * 64
_FAKE_CSRF_HASH = "b" * 64
_FAKE_SESSION_TOKEN = "session-manualito"
_FAKE_CSRF_TOKEN = "csrf-manualito"
_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = uuid4()
_CONVERSATION_ID = uuid4()
_USER_MESSAGE_ID = uuid4()
_ASSISTANT_MESSAGE_ID = uuid4()
_NOW = datetime(2026, 6, 2, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_conversation_and_db():
    """Inyecta auth, sesión, juego y conversación falsas."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    app.dependency_overrides[valid_game_id] = lambda: _GAME_ID
    app.dependency_overrides[valid_conversation] = lambda: _conversation()
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)
        app.dependency_overrides.pop(valid_game_id, None)
        app.dependency_overrides.pop(valid_conversation, None)


def test_list_game_conversations_returns_owned_conversations(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """El listado se delega con auth y juego ya validados."""
    list_mock = AsyncMock(return_value=[_conversation_response()])
    monkeypatch.setattr("api.conversations.router.list_conversations", list_mock)

    response = client.get(f"/api/games/{_GAME_ID}/conversations")

    assert response.status_code == 200
    assert response.json()["conversations"][0]["id"] == str(_CONVERSATION_ID)
    list_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        auth=list_mock.await_args.kwargs["auth"],
        game_id=_GAME_ID,
        limit=50,
        offset=0,
    )


def test_create_game_conversation_returns_201(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """Crear conversación es un mutante con CSRF y status 201."""
    create_mock = AsyncMock(return_value=_conversation_response())
    monkeypatch.setattr("api.conversations.router.create_conversation", create_mock)

    response = client.post(f"/api/games/{_GAME_ID}/conversations")

    assert response.status_code == 201
    assert response.json()["title"] == "Cómo se gana"
    create_mock.assert_awaited_once()
    assert create_mock.await_args.kwargs["game_id"] == _GAME_ID


def test_create_game_conversation_is_rate_limited(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """Crear conversaciones vacías tiene freno para evitar bloat de BD."""
    create_mock = AsyncMock(return_value=_conversation_response())
    monkeypatch.setattr("api.conversations.router.create_conversation", create_mock)

    responses = [
        client.post(f"/api/games/{_GAME_ID}/conversations") for _index in range(31)
    ]

    assert responses[-1].status_code == 429
    assert responses[-1].json()["errors"][0]["code"] == "rate_limited"
    assert create_mock.await_count == 30


def test_list_conversation_messages_uses_valid_conversation(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """El GET de mensajes valida ownership y delega con el path param tipado."""
    list_mock = AsyncMock(return_value=[_message_response("user", "¿Cómo se gana?")])
    monkeypatch.setattr("api.conversations.router.list_messages", list_mock)

    response = client.get(f"/api/conversations/{_CONVERSATION_ID}/messages")

    assert response.status_code == 200
    assert response.json()["messages"][0]["content"] == "¿Cómo se gana?"
    list_mock.assert_awaited_once()
    assert list_mock.await_args.kwargs["conversation_id"] == _CONVERSATION_ID


def test_send_conversation_message_persists_turn(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """Enviar mensaje delega el turno completo en el servicio."""
    send_mock = AsyncMock(return_value=_send_message_response())
    monkeypatch.setattr("api.conversations.router.send_message", send_mock)

    response = client.post(
        f"/api/conversations/{_CONVERSATION_ID}/messages",
        json={"content": "  ¿Y si empato?  ", "top_k": 4},
    )

    assert response.status_code == 200
    assert response.json()["assistant_message"]["role"] == "assistant"
    send_mock.assert_awaited_once()
    assert send_mock.await_args.kwargs["payload"].content == "¿Y si empato?"


def test_send_conversation_message_too_long_returns_public_code(
    client,
    override_auth_conversation_and_db,
):
    """Un mensaje demasiado largo devuelve error estable para el formulario."""
    response = client.post(
        f"/api/conversations/{_CONVERSATION_ID}/messages",
        json={"content": "x" * (USER_MESSAGE_MAX_LENGTH + 1)},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["errors"][0]["field"] == "content"
    assert body["errors"][0]["code"] == "message_too_long"


def test_delete_conversation_soft_deletes_owned_conversation(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """El borrado lógico exige auth/CSRF y no devuelve cuerpo."""
    delete_mock = AsyncMock()
    monkeypatch.setattr("api.conversations.router.delete_conversation", delete_mock)

    response = client.delete(f"/api/conversations/{_CONVERSATION_ID}")

    assert response.status_code == 204
    assert response.content == b""
    delete_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        auth=delete_mock.await_args.kwargs["auth"],
        conversation_id=_CONVERSATION_ID,
    )


def test_conversation_not_found_returns_stable_404(
    client,
    monkeypatch,
    override_auth_conversation_and_db,
):
    """Una conversación ajena usa el mismo error que una inexistente."""
    monkeypatch.setattr(
        "api.conversations.router.list_messages",
        AsyncMock(side_effect=ConversationNotFoundError),
    )

    response = client.get(f"/api/conversations/{_CONVERSATION_ID}/messages")

    assert response.status_code == 404
    assert any(
        error["code"] == "conversation_not_found" for error in response.json()["errors"]
    )


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=_USER_ID,
            token_hash=_FAKE_SESSION_HASH,
            csrf_token_hash=_FAKE_CSRF_HASH,
            expires_at=_NOW + timedelta(days=7),
        ),
        session_token=_FAKE_SESSION_TOKEN,
        csrf_token=_FAKE_CSRF_TOKEN,
    )


def _user() -> User:
    """Crea un usuario ORM mínimo para rutas autenticadas."""
    return User(
        id=_USER_ID,
        email="manualito@example.com",
        username="Manualito",
        username_key="manualito",
        password_hash=_FAKE_HASH,
        role="user",
        status="active",
        created_at=_NOW,
        last_login_at=None,
        password_changed_at=_NOW,
    )


def _conversation() -> Conversation:
    """Crea una conversación ORM mínima para dependencias."""
    return Conversation(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        title="Cómo se gana",
        created_at=_NOW,
        updated_at=_NOW,
    )


def _conversation_response() -> ConversationResponse:
    """Construye una respuesta estable de conversación."""
    return ConversationResponse(
        id=_CONVERSATION_ID,
        game_id=_GAME_ID,
        game_name="Catan",
        title="Cómo se gana",
        created_at=_NOW,
        updated_at=_NOW,
    )


def _message_response(role: Literal["user", "assistant"], content: str) -> MessageResponse:
    """Construye una respuesta estable de mensaje."""
    return MessageResponse(
        id=_USER_MESSAGE_ID if role == "user" else _ASSISTANT_MESSAGE_ID,
        role=role,
        content=content,
        created_at=_NOW,
    )


def _send_message_response() -> SendMessageResponse:
    """Construye una respuesta estable de turno conversacional."""
    return SendMessageResponse(
        conversation=_conversation_response(),
        user_message=_message_response("user", "¿Y si empato?"),
        assistant_message=_message_response("assistant", "Revisa el desempate."),
    )
