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
from api.games.exceptions import GameNotFoundError
from api.main import app
from api.rate_limit import limiter
from api.ratings.exceptions import RatingNotFoundError
from api.ratings.repository import delete_user_rating, get_user_rating, upsert_user_rating
from database.models.auth import AuthSession
from database.models.constants import RATING_NOTE_MAX_LENGTH
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000021")
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_game_and_db():
    """Inyecta auth, sesión de BD y juego activo falsos."""

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


def test_rate_game_upserts_score_and_trimmed_note(
    client,
    monkeypatch,
    override_auth_game_and_db,
):
    """Valorar delega el upsert con la nota recortada y el usuario autenticado."""
    upsert_mock = AsyncMock(return_value=_rating_row(score=4, note="Brilla a 4 jugadores."))
    auto_follow_mock = AsyncMock()
    monkeypatch.setattr("api.ratings.router.upsert_user_rating", upsert_mock)
    monkeypatch.setattr(
        "api.ratings.router.games_repository.auto_follow_game",
        auto_follow_mock,
    )

    response = client.put(
        f"/api/games/{_GAME_ID}/rating",
        json={"score": 4, "note": "  Brilla a 4 jugadores.  "},
    )

    assert response.status_code == 200
    assert response.json()["score"] == 4
    upsert_mock.assert_awaited_once()
    assert upsert_mock.await_args.kwargs["user_id"] == _USER_ID
    assert upsert_mock.await_args.kwargs["game_id"] == _GAME_ID
    assert upsert_mock.await_args.kwargs["note"] == "Brilla a 4 jugadores."
    auto_follow_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )


def test_rate_game_accepts_score_boundaries_without_note(
    client,
    monkeypatch,
    override_auth_game_and_db,
):
    """Los extremos válidos del score (1 y 5) pasan sin nota."""
    upsert_mock = AsyncMock(side_effect=[_rating_row(score=1), _rating_row(score=5)])
    auto_follow_mock = AsyncMock()
    monkeypatch.setattr("api.ratings.router.upsert_user_rating", upsert_mock)
    monkeypatch.setattr(
        "api.ratings.router.games_repository.auto_follow_game",
        auto_follow_mock,
    )

    low = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 1})
    high = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 5})

    assert low.status_code == 200
    assert high.status_code == 200
    assert upsert_mock.await_args.kwargs["note"] is None
    assert auto_follow_mock.await_count == 2


def test_rate_game_rejects_scores_outside_range(
    client,
    override_auth_game_and_db,
):
    """Un score fuera de 1..5 devuelve 422 sin llegar al repositorio."""
    too_low = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 0})
    too_high = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 6})

    assert too_low.status_code == 422
    assert too_high.status_code == 422
    assert too_low.json()["errors"][0]["field"] == "score"


def test_rate_game_rejects_overlong_or_blank_note(
    client,
    override_auth_game_and_db,
):
    """La nota opcional respeta longitud máxima y no admite solo espacios."""
    too_long = client.put(
        f"/api/games/{_GAME_ID}/rating",
        json={"score": 3, "note": "x" * (RATING_NOTE_MAX_LENGTH + 1)},
    )
    blank = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 3, "note": "   "})

    assert too_long.status_code == 422
    assert blank.status_code == 422
    assert too_long.json()["errors"][0]["field"] == "note"


def test_rate_game_missing_game_returns_stable_404(
    client,
    override_auth_game_and_db,
):
    """Valorar un juego inexistente responde el 404 estable del catálogo."""

    def _missing_game():
        raise GameNotFoundError

    app.dependency_overrides[valid_game_id] = _missing_game

    response = client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 3})

    assert response.status_code == 404
    assert any(error["code"] == "game_not_found" for error in response.json()["errors"])


def test_rate_game_is_rate_limited(
    client,
    monkeypatch,
    override_auth_game_and_db,
):
    """Valorar comparte el freno de acciones interactivas."""
    upsert_mock = AsyncMock(return_value=_rating_row(score=3))
    auto_follow_mock = AsyncMock()
    monkeypatch.setattr("api.ratings.router.upsert_user_rating", upsert_mock)
    monkeypatch.setattr(
        "api.ratings.router.games_repository.auto_follow_game",
        auto_follow_mock,
    )

    responses = [
        client.put(f"/api/games/{_GAME_ID}/rating", json={"score": 3})
        for _index in range(31)
    ]

    assert responses[-1].status_code == 429
    assert upsert_mock.await_count == 30
    assert auto_follow_mock.await_count == 30


def test_delete_rating_removes_own_row(
    client,
    monkeypatch,
    override_auth_game_and_db,
):
    """Quitar la valoración delega con el usuario autenticado y devuelve 204."""
    delete_mock = AsyncMock()
    monkeypatch.setattr("api.ratings.router.delete_user_rating", delete_mock)

    response = client.delete(f"/api/games/{_GAME_ID}/rating")

    assert response.status_code == 204
    assert response.content == b""
    delete_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )


def test_delete_rating_not_found_returns_stable_404(
    client,
    monkeypatch,
    override_auth_game_and_db,
):
    """Quitar una valoración inexistente responde 404 con código propio."""
    monkeypatch.setattr(
        "api.ratings.router.delete_user_rating",
        AsyncMock(side_effect=RatingNotFoundError),
    )

    response = client.delete(f"/api/games/{_GAME_ID}/rating")

    assert response.status_code == 404
    assert any(error["code"] == "rating_not_found" for error in response.json()["errors"])


def test_upsert_user_rating_compiles_to_atomic_on_conflict_update():
    """El upsert resuelve la carrera de PUTs concurrentes en una sentencia."""
    row = _rating_row(score=5)

    class FakeResult:
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
            upsert_user_rating,
            session,
            user_id=_USER_ID,
            game_id=_GAME_ID,
            score=5,
            note=None,
        )
    )

    assert stored is row
    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "INSERT INTO ratings" in compiled
    assert "ON CONFLICT (user_id, game_id) DO UPDATE" in compiled
    assert "RETURNING" in compiled


def test_get_user_rating_embeds_ownership_in_query():
    """La lectura de valoración filtra por usuario y juego en el WHERE."""

    class FakeResult:
        def one_or_none(self):
            return None

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    rating = anyio.run(
        partial(get_user_rating, session, user_id=_USER_ID, game_id=_GAME_ID)
    )

    assert rating is None
    compiled = _compile(session.statement)
    assert "ratings.user_id =" in compiled
    assert "ratings.game_id =" in compiled


def test_delete_user_rating_raises_when_no_row_deleted():
    """Borrar sin fila existente lanza 404 de dominio y no hace commit."""

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            return SimpleNamespace(rowcount=0)

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    with pytest.raises(RatingNotFoundError):
        anyio.run(
            partial(delete_user_rating, session, user_id=_USER_ID, game_id=_GAME_ID)
        )

    assert session.commits == 0


def test_delete_user_rating_commits_when_row_deleted():
    """Borrar la valoración propia confirma la transacción."""

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return SimpleNamespace(rowcount=1)

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    anyio.run(partial(delete_user_rating, session, user_id=_USER_ID, game_id=_GAME_ID))

    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "DELETE FROM ratings" in compiled
    assert "ratings.user_id =" in compiled


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


def _rating_row(*, score: int, note: str | None = None) -> SimpleNamespace:
    """Construye la fila devuelta por el upsert con RETURNING."""
    return SimpleNamespace(
        game_id=_GAME_ID,
        score=score,
        note=note,
        created_at=_NOW,
        updated_at=_NOW,
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
