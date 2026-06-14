from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

from api.auth.dependencies import get_current_auth
from api.auth.service import AuthenticatedSession
from api.games import repository, service
from api.games.schemas import MyGameItem, MyGamesResponse
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000041")
_NOW = datetime(2026, 6, 13, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsos (GET, sin CSRF)."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)


def _item() -> MyGameItem:
    return MyGameItem(
        id=_GAME_ID,
        name="Catan",
        bgg_id=13,
        year_published=1995,
        manuals_count=2,
        conversations_count=1,
        last_activity_at=_NOW,
    )


def test_my_games_delegates_with_user_and_pagination(client, monkeypatch, override_auth_and_db):
    """La biblioteca delega con el usuario autenticado y la paginación, y devuelve la lista."""
    list_mock = AsyncMock(return_value=MyGamesResponse(games=[_item()]))
    monkeypatch.setattr("api.games.router.list_my_games", list_mock)

    response = client.get("/api/games/mine", params={"limit": 10, "offset": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["games"][0]["name"] == "Catan"
    assert body["games"][0]["manuals_count"] == 2
    assert body["games"][0]["conversations_count"] == 1
    list_mock.assert_awaited_once()
    assert list_mock.await_args.kwargs["user_id"] == _USER_ID
    assert list_mock.await_args.kwargs["limit"] == 10
    assert list_mock.await_args.kwargs["offset"] == 5


def test_my_games_route_is_not_captured_as_game_id(client, monkeypatch, override_auth_and_db):
    """La ruta `/mine` se resuelve como su propio endpoint, no como `/{game_id}` (UUID)."""
    list_mock = AsyncMock(return_value=MyGamesResponse(games=[]))
    monkeypatch.setattr("api.games.router.list_my_games", list_mock)

    response = client.get("/api/games/mine")

    assert response.status_code == 200
    list_mock.assert_awaited_once()


def test_list_my_games_service_maps_rows(monkeypatch):
    """El service transforma filas internas en el contrato público de biblioteca."""
    row = SimpleNamespace(
        id=_GAME_ID,
        name="Catan",
        bgg_id=13,
        year_published=1995,
        manuals_count=2,
        conversations_count=1,
        last_activity_at=_NOW,
    )
    repo_mock = AsyncMock(return_value=[row])
    monkeypatch.setattr("api.games.service.repository.list_my_games", repo_mock)

    response = anyio.run(
        partial(service.list_my_games, object(), user_id=_USER_ID, limit=20, offset=5)
    )

    assert response == MyGamesResponse(games=[_item()])
    assert repo_mock.await_args.kwargs == {"user_id": _USER_ID, "limit": 20, "offset": 5}


def test_list_my_games_repository_unions_engagement_and_orders_by_activity():
    """La query usa seguimientos y ordena por actividad."""

    class FakeResult:
        def __iter__(self):
            return iter([])

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()
    rows = anyio.run(
        partial(repository.list_my_games, session, user_id=_USER_ID, limit=10, offset=3)
    )

    assert rows == []
    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "JOIN game_follows" in compiled
    assert "game_follows.user_id =" in compiled
    assert "game_follows.following IS true" in compiled
    assert "manuals.owner_user_id =" in compiled
    assert "conversations.user_id =" in compiled
    assert "greatest" in compiled.lower()
    assert "ORDER BY" in compiled.upper()
    assert "LIMIT" in compiled.upper()
    assert "OFFSET" in compiled.upper()


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
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
