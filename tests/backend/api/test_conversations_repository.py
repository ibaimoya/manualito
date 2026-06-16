from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import anyio
import pytest
from sqlalchemy.dialects import postgresql

import api.conversations.repository as conversation_repository
from api.conversations.exceptions import ConversationNotFoundError
from api.conversations.repository import (
    append_pending_message_pair,
    get_owned_conversation,
    list_conversation_messages,
    list_game_conversations,
    load_conversation_title_context,
    load_conversation_turn_context,
    load_recent_messages,
    rename_user_conversation,
    soft_delete_conversation,
    update_conversation_title,
)
from api.games.exceptions import GameUnavailableError

_USER_ID = UUID("018fd000-0000-7000-8000-000000000010")
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000011")
_CONVERSATION_ID = UUID("018fd000-0000-7000-8000-000000000012")
_USER_MESSAGE_ID = UUID("018fd000-0000-7000-8000-000000000013")


def test_get_owned_conversation_embeds_ownership_in_query():
    """El lookup de conversación filtra por usuario y borrado lógico."""

    class FakeResult:
        def scalar_one_or_none(self):
            return SimpleNamespace(id=_CONVERSATION_ID)

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    conversation = anyio.run(
        partial(
            get_owned_conversation,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
        )
    )

    assert conversation.id == _CONVERSATION_ID
    compiled = _compile(session.statement)
    assert "conversations.user_id =" in compiled
    assert "conversations.deleted_at IS NULL" in compiled


def test_get_owned_conversation_raises_for_missing_or_foreign_conversation():
    """Una conversación ajena o inexistente se traduce a 404 de dominio."""

    class FakeResult:
        def scalar_one_or_none(self):
            return None

    class FakeSession:
        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            return FakeResult()

    with pytest.raises(ConversationNotFoundError):
        anyio.run(
            partial(
                get_owned_conversation,
                FakeSession(),
                user_id=_USER_ID,
                conversation_id=_CONVERSATION_ID,
            )
        )


def test_list_game_conversations_orders_by_recent_activity():
    """El listado de juego conserva ownership y orden de recencia."""

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return []

    session = FakeSession()

    rows = anyio.run(
        partial(
            list_game_conversations,
            session,
            user_id=_USER_ID,
            game_id=_GAME_ID,
            limit=10,
            offset=0,
        )
    )

    assert rows == []
    compiled = _compile(session.statement)
    assert "conversations.user_id =" in compiled
    assert "conversations.game_id =" in compiled
    assert "conversations.updated_at DESC" in compiled
    # La ruleta de "generando" sale de un EXISTS correlacionado de asistente pendiente.
    assert "has_pending_reply" in compiled
    assert "EXISTS (SELECT" in compiled
    assert "messages.conversation_id = conversations.id" in compiled


def test_list_conversation_messages_orders_chronologically():
    """Los mensajes se devuelven en orden natural de lectura."""

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return SimpleNamespace(scalars=lambda: [])

    session = FakeSession()

    messages = anyio.run(
        partial(
            list_conversation_messages,
            session,
            conversation_id=_CONVERSATION_ID,
            limit=50,
            offset=0,
        )
    )

    assert messages == []
    compiled = _compile(session.statement)
    assert "messages.conversation_id =" in compiled
    assert "messages.created_at ASC" in compiled


def test_append_pending_message_pair_persists_placeholder(monkeypatch):
    """El turno inicial guarda usuario completado y asistente pendiente."""
    conversation = SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        title=None,
        updated_at=None,
    )
    session = SimpleNamespace(added=[], flushes=0, commits=0)

    def add(message):
        session.added.append(message)

    async def flush():
        await anyio.lowlevel.checkpoint()
        session.flushes += 1

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.add = add
    session.flush = flush
    session.commit = commit
    monkeypatch.setattr(
        conversation_repository,
        "_get_active_conversation_for_write",
        AsyncMock(return_value=conversation),
    )
    monkeypatch.setattr(
        conversation_repository,
        "get_conversation_summary",
        AsyncMock(return_value=SimpleNamespace(id=_CONVERSATION_ID)),
    )

    stored = anyio.run(
        partial(
            append_pending_message_pair,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            user_content="Pregunta",
            title="Título",
        )
    )

    assert stored.user_message.sources == []
    assert stored.user_message.status == "completed"
    assert stored.assistant_message.sources == []
    assert stored.assistant_message.status == "pending"
    assert stored.assistant_message.content == ""
    assert session.flushes == 2
    assert session.commits == 1


def test_load_recent_messages_reverses_descending_slice():
    """El historial carga últimos mensajes y los entrega en orden ascendente."""
    first = SimpleNamespace(content="primero")
    second = SimpleNamespace(content="segundo")

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return SimpleNamespace(scalars=lambda: [second, first])

    session = FakeSession()

    messages = anyio.run(
        partial(load_recent_messages, session, conversation_id=_CONVERSATION_ID, limit=2)
    )

    assert [message.content for message in messages] == ["primero", "segundo"]
    assert "messages.created_at DESC" in _compile(session.statement)


def test_load_recent_messages_skips_query_when_limit_is_zero():
    """Sin presupuesto de historial no se consulta la tabla de mensajes."""
    session = SimpleNamespace(execute=None)

    messages = anyio.run(
        partial(load_recent_messages, session, conversation_id=_CONVERSATION_ID, limit=0)
    )

    assert messages == []


def test_load_conversation_turn_context_returns_snapshot_and_history():
    """El contexto de turno no expone objetos ORM vivos al servicio."""
    conversation = SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        title=None,
    )
    message = SimpleNamespace(role="user", content="¿Cómo se gana?")

    class ConversationResult:
        def one_or_none(self):
            return _conversation_row(conversation, game_status="active")

    class MessageResult:
        def scalars(self):
            return [message]

    class FakeSession:
        def __init__(self):
            self.statements = []

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statements.append(statement)
            return ConversationResult() if len(self.statements) == 1 else MessageResult()

    session = FakeSession()

    context = anyio.run(
        partial(
            load_conversation_turn_context,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            history_limit=5,
        )
    )

    assert context.id == _CONVERSATION_ID
    assert context.game_id == _GAME_ID
    assert context.history[0].content == "¿Cómo se gana?"
    compiled = _compile(session.statements[0])
    assert "JOIN games ON games.id = conversations.game_id" in compiled
    assert "conversations.user_id =" in compiled


def test_load_conversation_title_context_reads_message_from_postgres():
    """El worker de título solo necesita IDs en Celery y lee contenido de Postgres."""
    conversation = SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        title="Fallback",
    )
    user_message = SimpleNamespace(
        id=_USER_MESSAGE_ID,
        role="user",
        content="¿Cómo se gana?",
        created_at=None,
    )
    previous_message = SimpleNamespace(role="assistant", content="Con puntos.")

    class ConversationResult:
        def one_or_none(self):
            return _conversation_row(conversation, game_status="active")

    class UserMessageResult:
        def scalar_one_or_none(self):
            return user_message

    class HistoryResult:
        def scalars(self):
            return [previous_message]

    class FakeSession:
        def __init__(self):
            self.statements = []

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statements.append(statement)
            results = (ConversationResult(), UserMessageResult(), HistoryResult())
            return results[len(self.statements) - 1]

    session = FakeSession()

    context = anyio.run(
        partial(
            load_conversation_title_context,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            user_message_id=_USER_MESSAGE_ID,
            history_limit=5,
        )
    )

    assert context.game_name == "Catan"
    assert context.question == "¿Cómo se gana?"
    assert context.history[0].content == "Con puntos."
    compiled = _compile(session.statements[1])
    assert "messages.role =" in compiled
    assert "messages.status =" in compiled


def test_load_conversation_turn_context_rejects_hidden_game():
    """Una conversación válida no acepta turnos si su juego está oculto."""
    conversation = SimpleNamespace(
        id=_CONVERSATION_ID,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        title=None,
    )

    class FakeResult:
        def one_or_none(self):
            return _conversation_row(conversation, game_status="hidden")

    class FakeSession:
        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            return FakeResult()

    with pytest.raises(GameUnavailableError):
        anyio.run(
            partial(
                load_conversation_turn_context,
                FakeSession(),
                user_id=_USER_ID,
                conversation_id=_CONVERSATION_ID,
                history_limit=5,
            )
        )


def test_soft_delete_conversation_marks_owned_row():
    """El borrado lógico reutiliza el lookup con ownership antes de escribir."""
    conversation = SimpleNamespace(id=_CONVERSATION_ID, deleted_at=None, updated_at=None)

    class FakeResult:
        def scalar_one_or_none(self):
            return conversation

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            return FakeResult()

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    anyio.run(
        partial(
            soft_delete_conversation,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
        )
    )

    assert conversation.deleted_at is not None
    assert conversation.updated_at is conversation.deleted_at
    assert session.commits == 1


def test_rename_user_conversation_updates_title_without_touching_activity(monkeypatch):
    """Renombrar guarda el título nuevo sin reordenar por actividad reciente."""
    conversation = SimpleNamespace(id=_CONVERSATION_ID, title="Viejo", updated_at="antes")
    summary = SimpleNamespace(id=_CONVERSATION_ID, title="Nuevo")
    session = SimpleNamespace(commits=0)

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.commit = commit
    monkeypatch.setattr(
        conversation_repository,
        "get_owned_conversation",
        AsyncMock(return_value=conversation),
    )
    monkeypatch.setattr(
        conversation_repository,
        "get_conversation_summary",
        AsyncMock(return_value=summary),
    )

    row = anyio.run(
        partial(
            rename_user_conversation,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            title="Nuevo",
        )
    )

    assert row is summary
    assert conversation.title == "Nuevo"
    assert conversation.updated_at == "antes"
    assert session.commits == 1


def test_update_conversation_title_applies_refinement_over_fallback(monkeypatch):
    """El título refinado sustituye al fallback cuando nadie lo cambió antes."""
    conversation = SimpleNamespace(
        id=_CONVERSATION_ID,
        title="Fallback inicial",
        updated_at=None,
    )
    session = SimpleNamespace(commits=0)

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.commit = commit
    monkeypatch.setattr(
        conversation_repository,
        "_get_active_conversation_for_write",
        AsyncMock(return_value=conversation),
    )

    anyio.run(
        partial(
            update_conversation_title,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            expected_title="Fallback inicial",
            title="Título refinado",
        )
    )

    assert conversation.title == "Título refinado"
    assert conversation.updated_at is not None
    assert session.commits == 1


def test_update_conversation_title_discards_when_user_already_renamed(monkeypatch):
    """El título refinado del LLM pierde contra un rename manual del usuario."""
    conversation = SimpleNamespace(id=_CONVERSATION_ID, title="Mi título", updated_at=None)
    session = SimpleNamespace(commits=0, rollbacks=0)

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1

    session.commit = commit
    session.rollback = rollback
    monkeypatch.setattr(
        conversation_repository,
        "_get_active_conversation_for_write",
        AsyncMock(return_value=conversation),
    )

    anyio.run(
        partial(
            update_conversation_title,
            session,
            user_id=_USER_ID,
            conversation_id=_CONVERSATION_ID,
            expected_title="Fallback inicial",
            title="Título refinado",
        )
    )

    assert conversation.title == "Mi título"
    assert session.commits == 0
    assert session.rollbacks == 1


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))


def _conversation_row(conversation, *, game_status: str):
    """Construye una fila mixta ORM+columnas etiquetadas para SQLAlchemy."""

    class FakeRow:
        game_deleted_at = None
        game_name = "Catan"

        def __init__(self):
            self.game_status = game_status

        def __getitem__(self, index):
            if index == 0:
                return conversation
            raise IndexError(index)

    return FakeRow()
