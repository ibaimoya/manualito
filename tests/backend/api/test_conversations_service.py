from contextlib import asynccontextmanager
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest

import api.conversations.service as conversation_service
from api.auth.service import AuthenticatedSession
from api.conversations.exceptions import NoManualSourcesError
from api.conversations.schemas import SendMessageRequest
from api.conversations.service import generate_pending_reply, send_message
from api.manuals.exceptions import GeneratedAnswerTooLongError
from api.manuals.schemas import AnswerResponse, AnswerSource

_USER_ID = uuid4()
_GAME_ID = uuid4()
_CONVERSATION_ID = uuid4()
_USER_MESSAGE_ID = uuid4()
_ASSISTANT_MESSAGE_ID = uuid4()
_MANUAL_ID = uuid4()
_MANUAL_TITLE = "Reglamento base"


def test_send_message_persists_pending_pair_and_returns_title_job(monkeypatch):
    """La petición guarda un mensaje provisional y no llama al LLM en caliente."""
    session = _session()
    turn_context = _turn_context(
        title=None,
        history=[
            SimpleNamespace(role="user", content="¿Cómo se gana?"),
            SimpleNamespace(role="assistant", content="Se gana con 10 puntos."),
        ],
    )
    append_mock = AsyncMock(return_value=_stored_pair(title="¿Y si empato?"))
    auto_follow_mock = AsyncMock()

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        AsyncMock(return_value=turn_context),
    )
    monkeypatch.setattr(
        "api.conversations.service.repository.append_pending_message_pair",
        append_mock,
    )
    monkeypatch.setattr(
        "api.conversations.service.games_repository.auto_follow_game",
        auto_follow_mock,
    )
    monkeypatch.setattr(
        "api.conversations.service.games_repository.game_pool_has_manuals",
        AsyncMock(return_value=True),
    )

    outcome = anyio.run(
        partial(
            send_message,
            session,
            auth=_auth(),
            conversation_id=_CONVERSATION_ID,
            payload=SendMessageRequest(content="¿Y si empato?", top_k=4),
        )
    )

    assert outcome.response.conversation.title == "¿Y si empato?"
    assert outcome.response.assistant_message.status == "pending"
    assert outcome.response.assistant_message.content == ""
    assert outcome.title_job is not None
    assert outcome.title_job.user_message_id == _USER_MESSAGE_ID
    assert outcome.title_job.expected_title == "¿Y si empato?"
    assert append_mock.await_args.kwargs["user_id"] == _USER_ID
    assert append_mock.await_args.kwargs["conversation_id"] == _CONVERSATION_ID
    assert append_mock.await_args.kwargs["title"] == "¿Y si empato?"
    auto_follow_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )
    assert session.rollbacks == 3


def test_send_message_skips_title_job_when_conversation_already_has_title(monkeypatch):
    """Con título existente solo se crea el turno pendiente."""
    session = _session()
    append_mock = AsyncMock(return_value=_stored_pair(title="Cómo se gana"))

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        AsyncMock(return_value=_turn_context(title="Cómo se gana", history=[])),
    )
    monkeypatch.setattr(
        "api.conversations.service.repository.append_pending_message_pair",
        append_mock,
    )
    monkeypatch.setattr(
        "api.conversations.service.games_repository.auto_follow_game",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "api.conversations.service.games_repository.game_pool_has_manuals",
        AsyncMock(return_value=True),
    )

    outcome = anyio.run(
        partial(
            send_message,
            session,
            auth=_auth(),
            conversation_id=_CONVERSATION_ID,
            payload=SendMessageRequest(content="Primera pregunta"),
        )
    )

    assert outcome.title_job is None
    assert append_mock.await_args.kwargs["title"] is None


def test_send_message_blocks_when_game_has_no_sources(monkeypatch):
    """Sin manuales que citar, el turno se rechaza sin crear el mensaje pendiente."""
    session = _session()
    append_mock = AsyncMock()

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        AsyncMock(return_value=_turn_context(title="Cómo se gana", history=[])),
    )
    monkeypatch.setattr(
        "api.conversations.service.repository.append_pending_message_pair",
        append_mock,
    )
    monkeypatch.setattr(
        "api.conversations.service.games_repository.game_pool_has_manuals",
        AsyncMock(return_value=False),
    )

    with pytest.raises(NoManualSourcesError):
        anyio.run(
            partial(
                send_message,
                session,
                auth=_auth(),
                conversation_id=_CONVERSATION_ID,
                payload=SendMessageRequest(content="¿Y si empato?"),
            )
        )

    append_mock.assert_not_awaited()


def test_generate_pending_reply_uses_history_aware_retrieval_and_completes(monkeypatch):
    """El worker condensa con historial y rellena el placeholder del asistente."""
    source = AnswerSource(
        manual_id=_MANUAL_ID,
        manual_title=_MANUAL_TITLE,
        page=4,
        is_own=True,
    )
    context = _pending_context(
        history=[
            SimpleNamespace(role="user", content="¿Cómo se gana?"),
            SimpleNamespace(role="assistant", content="Se gana con 10 puntos."),
        ]
    )
    answer_mock = AsyncMock(
        return_value=AnswerResponse(answer="Gana quien tenga más oro.", sources=[source])
    )
    complete_mock = AsyncMock()
    monkeypatch.setattr(
        conversation_service,
        "advisory_session_lock",
        _fake_lock_factory(object()),
    )
    monkeypatch.setattr(
        conversation_service.repository,
        "load_pending_reply_context",
        AsyncMock(return_value=context),
    )
    monkeypatch.setattr(
        conversation_service.internal_client,
        "post_json",
        AsyncMock(return_value={"question": "Desempate al llegar a 10 puntos"}),
    )
    monkeypatch.setattr(conversation_service, "generate_game_answer", answer_mock)
    monkeypatch.setattr(
        conversation_service.repository,
        "complete_assistant_message",
        complete_mock,
    )

    completed = anyio.run(
        partial(
            generate_pending_reply,
            _USER_ID,
            _CONVERSATION_ID,
            _USER_MESSAGE_ID,
            _ASSISTANT_MESSAGE_ID,
            4,
        )
    )

    assert completed is True
    assert conversation_service.internal_client.post_json.await_args.kwargs["url"].endswith(
        "/condense-question"
    )
    answer_kwargs = answer_mock.await_args.kwargs
    assert answer_kwargs["current_user_id"] == _USER_ID
    assert answer_kwargs["question"] == "¿Y si empato?"
    assert answer_kwargs["retrieval_question"] == "Desempate al llegar a 10 puntos"
    assert answer_kwargs["chat_history"][0]["role"] == "user"
    complete_mock.assert_awaited_once()
    assert complete_mock.await_args.kwargs["content"] == "Gana quien tenga más oro."
    assert complete_mock.await_args.kwargs["sources"][0]["manual_id"] == str(_MANUAL_ID)


def test_generate_pending_reply_returns_false_when_lock_is_busy(monkeypatch):
    """Si otro worker tiene el lock, Celery reintentará el mismo mensaje."""
    monkeypatch.setattr(
        conversation_service,
        "advisory_session_lock",
        _fake_lock_factory(None),
    )

    completed = anyio.run(
        partial(
            generate_pending_reply,
            _USER_ID,
            _CONVERSATION_ID,
            _USER_MESSAGE_ID,
            _ASSISTANT_MESSAGE_ID,
            4,
        )
    )

    assert completed is False


def test_generate_pending_reply_marks_overlong_answer_as_failed(monkeypatch):
    """Un error permanente del LLM deja el mensaje en failed con código estable."""
    fail_mock = AsyncMock()
    monkeypatch.setattr(
        conversation_service,
        "advisory_session_lock",
        _fake_lock_factory(object()),
    )
    monkeypatch.setattr(
        conversation_service.repository,
        "load_pending_reply_context",
        AsyncMock(return_value=_pending_context(history=[])),
    )
    monkeypatch.setattr(
        conversation_service,
        "generate_game_answer",
        AsyncMock(side_effect=GeneratedAnswerTooLongError),
    )
    monkeypatch.setattr(
        conversation_service.repository,
        "fail_assistant_message",
        fail_mock,
    )

    completed = anyio.run(
        partial(
            generate_pending_reply,
            _USER_ID,
            _CONVERSATION_ID,
            _USER_MESSAGE_ID,
            _ASSISTANT_MESSAGE_ID,
            4,
        )
    )

    assert completed is True
    fail_mock.assert_awaited_once()
    assert fail_mock.await_args.kwargs["error_code"] == "answer_too_long"


def test_refresh_conversation_title_uses_own_session(monkeypatch):
    """La tarea secundaria no reutiliza la sesión de la request."""
    session = _session()
    title_context = SimpleNamespace(
        game_name="Catan",
        question="¿Cómo se gana?",
        history=(),
    )
    load_context_mock = AsyncMock(return_value=title_context)
    update_mock = AsyncMock()
    monkeypatch.setattr(
        conversation_service.repository,
        "load_conversation_title_context",
        load_context_mock,
    )
    monkeypatch.setattr(
        conversation_service.internal_client,
        "post_json",
        AsyncMock(return_value={"title": "Título refinado"}),
    )
    monkeypatch.setattr(
        conversation_service.repository,
        "update_conversation_title",
        update_mock,
    )
    monkeypatch.setattr(
        conversation_service,
        "get_sessionmaker",
        lambda: _sessionmaker(session),
    )

    anyio.run(
        partial(
            conversation_service.refresh_conversation_title,
            _USER_ID,
            _CONVERSATION_ID,
            _USER_MESSAGE_ID,
            "Fallback",
        )
    )

    load_context_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        conversation_id=_CONVERSATION_ID,
        user_message_id=_USER_MESSAGE_ID,
        history_limit=conversation_service.config.CONVERSATION_HISTORY_MESSAGES,
    )
    update_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        conversation_id=_CONVERSATION_ID,
        expected_title="Fallback",
        title="Título refinado",
    )
    title_payload = conversation_service.internal_client.post_json.await_args.kwargs["payload"]
    assert title_payload == {
        "game_name": "Catan",
        "messages": [{"role": "user", "content": "¿Cómo se gana?"}],
    }


def _auth() -> AuthenticatedSession:
    """Construye una sesión autenticada mínima para el servicio."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


def _turn_context(*, title: str | None, history: list[SimpleNamespace]) -> SimpleNamespace:
    """Construye el snapshot de turno que devuelve el repositorio."""
    return SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        game_name="Catan",
        title=title,
        history=tuple(history),
    )


def _pending_context(*, history: list[SimpleNamespace]) -> SimpleNamespace:
    """Construye el snapshot de worker para una respuesta pendiente."""
    return SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        game_name="Catan",
        title="¿Y si empato?",
        user_message_content="¿Y si empato?",
        history=tuple(history),
    )


def _session() -> SimpleNamespace:
    """Construye una sesión falsa con rollback observable."""

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1

    session = SimpleNamespace(rollbacks=0)
    session.rollback = rollback
    return session


def _sessionmaker(session):
    """Construye una factoría async compatible con async_sessionmaker."""

    class FakeSessionmaker:
        def __call__(self):
            return self

        async def __aenter__(self):
            return session

        async def __aexit__(self, _exc_type, _exc, _traceback):
            return None

    return FakeSessionmaker()


def _stored_pair(*, title: str | None) -> SimpleNamespace:
    """Construye el resultado persistido que devuelve el repositorio."""
    return SimpleNamespace(
        conversation=SimpleNamespace(
            id=_CONVERSATION_ID,
            game_id=_GAME_ID,
            game_name="Catan",
            title=title,
            created_at="2026-06-02T10:00:00Z",
            updated_at="2026-06-02T10:01:00Z",
        ),
        user_message=SimpleNamespace(
            id=_USER_MESSAGE_ID,
            role="user",
            status="completed",
            content="¿Y si empato?",
            sources=[],
            error_code=None,
            created_at="2026-06-02T10:00:00Z",
        ),
        assistant_message=SimpleNamespace(
            id=_ASSISTANT_MESSAGE_ID,
            role="assistant",
            status="pending",
            content="",
            sources=[],
            error_code=None,
            created_at="2026-06-02T10:01:00Z",
        ),
    )


def _fake_lock_factory(lock_session):
    """Sustituye el advisory lock por una sesión falsa."""

    @asynccontextmanager
    async def fake_lock(_key):
        yield lock_session

    return fake_lock
