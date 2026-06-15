from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.service import AuthenticatedSession
from api.games.dependencies import valid_game_id
from api.games.repository import auto_follow_game, is_following, set_game_follow
from api.games.service import follow_game, unfollow_game
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000071")
_NOW = datetime(2026, 6, 14, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_game_csrf_and_db():
    """Inyecta auth, sesion de BD, CSRF y juego activo falsos."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    app.dependency_overrides[valid_game_id] = lambda: _GAME_ID
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)
        app.dependency_overrides.pop(valid_game_id, None)


def test_auto_follow_game_compiles_to_insert_do_nothing():
    """El auto-follow solo inserta si no hay eleccion previa."""
    session = _write_session()

    anyio.run(
        partial(auto_follow_game, session, user_id=_USER_ID, game_id=_GAME_ID)
    )

    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "INSERT INTO game_follows" in compiled
    assert "ON CONFLICT (user_id, game_id) DO NOTHING" in compiled


def test_set_game_follow_compiles_to_insert_or_update():
    """El follow explicito sobrescribe la ultima eleccion del usuario."""
    session = _write_session()

    anyio.run(
        partial(
            set_game_follow,
            session,
            user_id=_USER_ID,
            game_id=_GAME_ID,
            following=False,
        )
    )

    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "INSERT INTO game_follows" in compiled
    assert "ON CONFLICT (user_id, game_id) DO UPDATE" in compiled
    assert "SET following =" in compiled
    assert "updated_at = now()" in compiled


@pytest.mark.parametrize(("stored", "expected"), [(True, True), (False, False), (None, False)])
def test_is_following_returns_boolean(stored, expected):
    """La lectura de seguimiento convierte ausencia en False."""

    class FakeResult:
        def scalar_one_or_none(self):
            return stored

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    result = anyio.run(
        partial(is_following, session, user_id=_USER_ID, game_id=_GAME_ID)
    )

    assert result is expected
    compiled = _compile(session.statement)
    assert "game_follows.user_id =" in compiled
    assert "game_follows.game_id =" in compiled


def test_follow_game_service_validates_and_sets_true(monkeypatch):
    """Seguir valida el juego y guarda following True."""
    session = object()
    get_mock = AsyncMock(return_value=SimpleNamespace(id=_GAME_ID))
    set_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.get_game_for_detail", get_mock)
    monkeypatch.setattr("api.games.service.repository.set_game_follow", set_mock)

    anyio.run(partial(follow_game, session, user_id=_USER_ID, game_id=_GAME_ID))

    get_mock.assert_awaited_once_with(session, game_id=_GAME_ID)
    set_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        following=True,
    )


def test_unfollow_game_service_validates_and_sets_false(monkeypatch):
    """Dejar de seguir valida el juego y guarda following False."""
    session = object()
    get_mock = AsyncMock(return_value=SimpleNamespace(id=_GAME_ID))
    set_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.get_game_for_detail", get_mock)
    monkeypatch.setattr("api.games.service.repository.set_game_follow", set_mock)

    anyio.run(partial(unfollow_game, session, user_id=_USER_ID, game_id=_GAME_ID))

    get_mock.assert_awaited_once_with(session, game_id=_GAME_ID)
    set_mock.assert_awaited_once_with(
        session,
        user_id=_USER_ID,
        game_id=_GAME_ID,
        following=False,
    )


def test_follow_game_endpoint_returns_204(
    client,
    monkeypatch,
    override_auth_game_csrf_and_db,
):
    """El POST de follow delega con auth y no devuelve cuerpo."""
    follow_mock = AsyncMock()
    monkeypatch.setattr("api.games.router.follow_game", follow_mock)

    response = client.post(f"/api/games/{_GAME_ID}/follow")

    assert response.status_code == 204
    assert response.content == b""
    follow_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )


def test_unfollow_game_endpoint_returns_204(
    client,
    monkeypatch,
    override_auth_game_csrf_and_db,
):
    """El DELETE de follow delega con auth y no devuelve cuerpo."""
    unfollow_mock = AsyncMock()
    monkeypatch.setattr("api.games.router.unfollow_game", unfollow_mock)

    response = client.delete(f"/api/games/{_GAME_ID}/follow")

    assert response.status_code == 204
    assert response.content == b""
    unfollow_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )


def _write_session() -> SimpleNamespace:
    """Construye una sesion de escritura con commit observable."""
    session = SimpleNamespace(commits=0)

    async def execute(statement):
        await anyio.lowlevel.checkpoint()
        session.statement = statement
        return SimpleNamespace()

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.execute = execute
    session.commit = commit
    return session


def _auth_session() -> AuthenticatedSession:
    """Construye una sesion autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=User(
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
        ),
        auth_session=AuthSession(
            user_id=_USER_ID,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=_NOW + timedelta(days=7),
        ),
        session_token="session-manualito",
        csrf_token="csrf-manualito",
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspeccion estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
