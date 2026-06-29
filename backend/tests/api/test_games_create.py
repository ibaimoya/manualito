from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from functools import partial
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.service import AuthenticatedSession
from api.games import repository, service
from api.games.dto import CreatedGame
from api.games.schemas import GameSearchItem
from api.games.service import build_game_name_key
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.constants import GAME_NAME_MAX_LENGTH
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000031")
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
    """Inyecta auth, CSRF satisfecho y sesión de BD falsos."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)


def test_create_game_delegates_with_trimmed_name_and_returns_201(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Crear juego recorta el nombre, atribuye al usuario y devuelve 201 con su ficha."""
    create_mock = AsyncMock(return_value=_game_item("Mi juego casero"))
    monkeypatch.setattr("api.games.router.create_manual_game", create_mock)

    response = client.post("/api/games", json={"name": "  Mi juego casero  "})

    assert response.status_code == 201
    assert response.json() == {
        "id": str(_GAME_ID),
        "name": "Mi juego casero",
        "bgg_id": None,
        "year_published": None,
        "manuals_count": 0,
    }
    create_mock.assert_awaited_once()
    assert create_mock.await_args.kwargs["name"] == "Mi juego casero"
    assert create_mock.await_args.kwargs["created_by_user_id"] == _USER_ID


def test_create_game_rejects_blank_name(client, override_auth_and_db):
    """Un nombre en blanco tras recortar se rechaza con 422."""
    response = client.post("/api/games", json={"name": "   "})

    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


def test_create_game_rejects_overlong_name(client, override_auth_and_db):
    """Un nombre por encima del máximo del modelo se rechaza con 422."""
    response = client.post("/api/games", json={"name": "x" * (GAME_NAME_MAX_LENGTH + 1)})

    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "name"


def test_create_game_is_rate_limited(client, monkeypatch, override_auth_and_db):
    """Crear juego comparte el freno de acciones interactivas (30/min)."""
    create_mock = AsyncMock(return_value=_game_item("Mi juego casero"))
    monkeypatch.setattr("api.games.router.create_manual_game", create_mock)

    responses = [
        client.post("/api/games", json={"name": f"Juego {index}"}) for index in range(31)
    ]

    assert responses[-1].status_code == 429
    assert create_mock.await_count == 30


def test_create_manual_game_service_normalizes_key_and_counts_zero(monkeypatch):
    """El service normaliza la clave del nombre y devuelve la ficha con 0 manuales."""
    game = CreatedGame(
        id=_GAME_ID,
        name="Catán Casero",
        bgg_id=None,
        year_published=None,
    )
    repo_mock = AsyncMock(return_value=game)
    monkeypatch.setattr("api.games.service.repository.create_manual_game", repo_mock)

    item = anyio.run(
        partial(
            service.create_manual_game,
            object(),
            name="Catán Casero",
            created_by_user_id=_USER_ID,
        )
    )

    assert item == GameSearchItem(
        id=_GAME_ID,
        name="Catán Casero",
        bgg_id=None,
        year_published=None,
        manuals_count=0,
    )
    repo_mock.assert_awaited_once()
    assert repo_mock.await_args.kwargs["name"] == "Catán Casero"
    assert repo_mock.await_args.kwargs["name_key"] == build_game_name_key("Catán Casero")
    assert repo_mock.await_args.kwargs["created_by_user_id"] == _USER_ID


def test_create_manual_game_repository_inserts_and_commits():
    """El repositorio inserta el juego con RETURNING y confirma la transacción."""
    row = {"id": _GAME_ID, "name": "Mi juego", "bgg_id": None, "year_published": None}

    class FakeResult:
        def mappings(self):
            return self

        def one(self):
            return row

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()
    stored = anyio.run(
        partial(
            repository.create_manual_game,
            session,
            name="Mi juego",
            name_key="mi juego",
            created_by_user_id=_USER_ID,
        )
    )

    assert stored == CreatedGame(
        id=_GAME_ID,
        name="Mi juego",
        bgg_id=None,
        year_published=None,
    )
    assert session.commits == 1
    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "INSERT INTO games" in compiled
    assert "RETURNING" in compiled


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


def _game_item(name: str) -> GameSearchItem:
    """Ficha pública que devuelve el service tras crear el juego."""
    return GameSearchItem(
        id=_GAME_ID,
        name=name,
        bgg_id=None,
        year_published=None,
        manuals_count=0,
    )
