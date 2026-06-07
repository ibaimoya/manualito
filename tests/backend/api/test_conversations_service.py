from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest

import api.conversations.service as conversation_service
from api.auth.service import AuthenticatedSession
from api.conversations.schemas import SendMessageRequest
from api.conversations.service import send_message
from api.manuals.exceptions import GeneratedAnswerTooLongError
from api.manuals.schemas import AnswerResponse, AnswerSource

_USER_ID = uuid4()
_GAME_ID = uuid4()
_CONVERSATION_ID = uuid4()
_MANUAL_ID = uuid4()
_MANUAL_TITLE = "Reglamento base"


def test_send_message_uses_history_aware_retrieval_and_persists_pair(monkeypatch):
    """Con historial, el servicio reformula para RAG y responde con pregunta original."""
    session = _session()
    turn_context = _turn_context(
        title=None,
        history=[
            SimpleNamespace(role="user", content="¿Cómo se gana?"),
            SimpleNamespace(role="assistant", content="Se gana con 10 puntos."),
        ],
    )
    load_context_mock = AsyncMock(return_value=turn_context)
    post_json_mock = AsyncMock(
        return_value={"question": "Desempate al llegar a 10 puntos"},
    )
    source_payload = [
        {"manual_id": str(_MANUAL_ID), "manual_title": _MANUAL_TITLE, "page": 4}
    ]
    answer = AnswerResponse(
        answer="Gana quien tenga más oro.",
        sources=[
            AnswerSource(
                manual_id=_MANUAL_ID,
                manual_title=_MANUAL_TITLE,
                page=4,
            )
        ],
    )
    answer_mock = AsyncMock(return_value=answer)
    append_mock = AsyncMock(
        return_value=_stored_pair(title="¿Y si empato?", sources=source_payload)
    )
    background_tasks = _background_tasks()

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        load_context_mock,
    )
    monkeypatch.setattr("api.conversations.service.internal_client.post_json", post_json_mock)
    monkeypatch.setattr("api.conversations.service.generate_game_answer", answer_mock)
    monkeypatch.setattr("api.conversations.service.repository.append_message_pair", append_mock)

    response = anyio.run(
        partial(
            send_message,
            session,
            auth=_auth(),
            conversation_id=_CONVERSATION_ID,
            payload=SendMessageRequest(content="¿Y si empato?", top_k=4),
            client=object(),
            background_tasks=background_tasks,
        )
    )

    assert response.conversation.title == "¿Y si empato?"
    assert response.assistant_message.content == "Gana quien tenga más oro."
    assert response.assistant_message.sources == answer.sources
    assert post_json_mock.await_args.kwargs["url"].endswith("/condense-question")
    answer_kwargs = answer_mock.await_args.kwargs
    assert answer_kwargs["question"] == "¿Y si empato?"
    assert answer_kwargs["retrieval_question"] == "Desempate al llegar a 10 puntos"
    assert answer_kwargs["chat_history"][0]["role"] == "user"
    assert answer_kwargs["top_k"] == 4
    assert append_mock.await_args.kwargs["user_id"] == _USER_ID
    assert append_mock.await_args.kwargs["conversation_id"] == _CONVERSATION_ID
    assert append_mock.await_args.kwargs["assistant_sources"] == source_payload
    assert append_mock.await_args.kwargs["title"] == "¿Y si empato?"
    assert session.rollbacks == 2
    assert len(background_tasks.tasks) == 1


def test_send_message_skips_condense_without_history(monkeypatch):
    """Sin historial, RAG busca con la pregunta original."""
    session = _session()
    turn_context = _turn_context(title="Cómo se gana", history=[])
    post_json_mock = AsyncMock()
    answer_mock = AsyncMock(return_value=AnswerResponse(answer="Respuesta."))
    append_mock = AsyncMock(return_value=_stored_pair(title="Cómo se gana"))
    background_tasks = _background_tasks()

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        AsyncMock(return_value=turn_context),
    )
    monkeypatch.setattr("api.conversations.service.internal_client.post_json", post_json_mock)
    monkeypatch.setattr("api.conversations.service.generate_game_answer", answer_mock)
    monkeypatch.setattr("api.conversations.service.repository.append_message_pair", append_mock)

    anyio.run(
        partial(
            send_message,
            session,
            auth=_auth(),
            conversation_id=_CONVERSATION_ID,
            payload=SendMessageRequest(content="Primera pregunta"),
            client=object(),
            background_tasks=background_tasks,
        )
    )

    post_json_mock.assert_not_called()
    assert answer_mock.await_args.kwargs["retrieval_question"] == "Primera pregunta"
    assert append_mock.await_args.kwargs["title"] is None
    assert background_tasks.tasks == []


def test_send_message_propagates_overlong_answer_before_persisting(monkeypatch):
    """Una respuesta rechazada por retrieval no llega al commit del par de mensajes."""
    session = _session()
    answer_mock = AsyncMock(side_effect=GeneratedAnswerTooLongError)
    append_mock = AsyncMock()

    monkeypatch.setattr(
        "api.conversations.service.repository.load_conversation_turn_context",
        AsyncMock(return_value=_turn_context(title=None, history=[])),
    )
    monkeypatch.setattr("api.conversations.service.generate_game_answer", answer_mock)
    monkeypatch.setattr("api.conversations.service.repository.append_message_pair", append_mock)

    with pytest.raises(GeneratedAnswerTooLongError):
        anyio.run(
            partial(
                send_message,
                session,
                auth=_auth(),
                conversation_id=_CONVERSATION_ID,
                payload=SendMessageRequest(
                    content="Pregunta larguísima sobre el final de la partida",
                ),
                client=object(),
                background_tasks=_background_tasks(),
            )
        )

    append_mock.assert_not_called()


def test_refresh_conversation_title_uses_own_session(monkeypatch):
    """La tarea secundaria no reutiliza la sesión de la request."""
    session = object()
    update_mock = AsyncMock()
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
            conversation_service._refresh_conversation_title,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            expected_title="Fallback",
            question="¿Cómo se gana?",
            answer="Con 10 puntos.",
            history=[],
            client=object(),
        )
    )

    update_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        conversation_id=_CONVERSATION_ID,
        expected_title="Fallback",
        title="Título refinado",
    )


def _auth() -> AuthenticatedSession:
    """Construye una sesión autenticada mínima para el servicio."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


def _turn_context(*, title: str | None, history: list[SimpleNamespace]) -> SimpleNamespace:
    """Construye el snapshot de turno que devuelve el repositorio."""
    return SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        title=title,
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


def _background_tasks() -> SimpleNamespace:
    """Construye un recolector mínimo compatible con BackgroundTasks."""

    def add_task(function, **kwargs):
        tasks.tasks.append((function, kwargs))

    tasks = SimpleNamespace(tasks=[])
    tasks.add_task = add_task
    return tasks


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


def _stored_pair(
    *,
    title: str | None,
    sources: list[dict[str, object]] | None = None,
) -> SimpleNamespace:
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
            id=uuid4(),
            role="user",
            content="¿Y si empato?",
            created_at="2026-06-02T10:00:00Z",
        ),
        assistant_message=SimpleNamespace(
            id=uuid4(),
            role="assistant",
            content="Gana quien tenga más oro.",
            sources=sources or [],
            created_at="2026-06-02T10:01:00Z",
        ),
    )
