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
from api.games.exceptions import GameNotFoundError
from api.games.repository import (
    count_user_game_conversations,
    get_game_for_detail,
    list_game_pool_manuals,
)
from api.games.schemas import GameDetailResponse
from api.games.service import get_game_detail
from api.main import app
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000031")
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para el hub."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)


def test_get_game_detail_returns_personal_hub(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El hub devuelve el juego con la vista personal del usuario."""
    detail_mock = AsyncMock(return_value=_detail_response())
    monkeypatch.setattr("api.games.router.get_game_detail", detail_mock)

    response = client.get(f"/api/games/{_GAME_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Catan"
    assert body["my_rating"]["score"] == 4
    assert body["manuals"][0]["is_own"] is True
    assert body["is_following"] is True
    assert body["attribution"] == "Powered by BoardGameGeek."
    detail_mock.assert_awaited_once()
    assert detail_mock.await_args.kwargs["game_id"] == _GAME_ID


def test_get_game_detail_missing_game_returns_stable_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un juego borrado responde el 404 estable del catálogo."""
    monkeypatch.setattr(
        "api.games.router.get_game_detail",
        AsyncMock(side_effect=GameNotFoundError),
    )

    response = client.get(f"/api/games/{_GAME_ID}")

    assert response.status_code == 404
    assert any(error["code"] == "game_not_found" for error in response.json()["errors"])


def test_get_game_detail_service_composes_personal_view(monkeypatch):
    """El servicio agrega juego, manuales visibles, conversaciones y rating."""
    game = _game_row()
    manual = SimpleNamespace(
        id=uuid4(),
        title="Edición clásica",
        source_type="pdf",
        page_count=7,
        duplicate_page_count=2,
        created_at=_NOW,
        is_own=True,
    )
    rating = SimpleNamespace(
        game_id=_GAME_ID,
        score=4,
        note="Brilla a 4 jugadores.",
        created_at=_NOW,
        updated_at=_NOW,
    )
    monkeypatch.setattr(
        "api.games.service.repository.get_game_for_detail",
        AsyncMock(return_value=game),
    )
    monkeypatch.setattr(
        "api.games.service.repository.list_game_pool_manuals",
        AsyncMock(return_value=[manual]),
    )
    monkeypatch.setattr(
        "api.games.service.repository.count_user_game_conversations",
        AsyncMock(return_value=12),
    )
    monkeypatch.setattr(
        "api.games.service.repository.is_following",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr("api.games.service.get_user_rating", AsyncMock(return_value=rating))

    response = anyio.run(
        partial(
            get_game_detail,
            _FAKE_SESSION,
            auth=_auth(),
            game_id=_GAME_ID,
        )
    )

    assert isinstance(response, GameDetailResponse)
    assert response.conversations_count == 12
    assert response.my_rating is not None
    assert response.my_rating.score == 4
    assert response.manuals[0].is_own is True
    assert response.manuals[0].duplicate_page_count == 2
    assert response.is_following is True


def test_get_game_detail_without_rating_returns_null(monkeypatch):
    """Sin valoración guardada el hub devuelve my_rating nulo."""
    monkeypatch.setattr(
        "api.games.service.repository.get_game_for_detail",
        AsyncMock(return_value=_game_row(bgg_id=None)),
    )
    monkeypatch.setattr(
        "api.games.service.repository.list_game_pool_manuals",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "api.games.service.repository.count_user_game_conversations",
        AsyncMock(return_value=0),
    )
    monkeypatch.setattr(
        "api.games.service.repository.is_following",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr("api.games.service.get_user_rating", AsyncMock(return_value=None))

    response = anyio.run(
        partial(
            get_game_detail,
            _FAKE_SESSION,
            auth=_auth(),
            game_id=_GAME_ID,
        )
    )

    assert response.my_rating is None
    assert response.manuals == []
    assert response.is_following is False


def test_get_game_for_detail_returns_row_when_game_exists():
    """Un juego vivo devuelve la fila base del hub."""
    row = SimpleNamespace(id=_GAME_ID, name="Catan", status="hidden")

    class FakeResult:
        def one_or_none(self):
            return row

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    game = anyio.run(partial(get_game_for_detail, FakeSession(), game_id=_GAME_ID))

    assert game is row


def test_get_game_for_detail_returns_hidden_games_but_not_deleted():
    """El hub admite juegos ocultos y rechaza los borrados."""

    class FakeResult:
        def one_or_none(self):
            return None

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    with pytest.raises(GameNotFoundError):
        anyio.run(partial(get_game_for_detail, session, game_id=_GAME_ID))

    compiled = _compile(session.statement)
    assert "games.deleted_at IS NULL" in compiled
    assert "games.status =" not in compiled


def test_list_game_pool_manuals_mirrors_retrieval_visibility():
    """El hub enseña los mismos manuales que autoriza la retrieval."""

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return []

    session = FakeSession()

    rows = anyio.run(
        partial(
            list_game_pool_manuals,
            session,
            game_id=_GAME_ID,
            current_user_id=_USER_ID,
        )
    )

    assert rows == []
    compiled = _compile(session.statement)
    assert "manuals.visibility = " in compiled
    assert "manuals.owner_user_id = " in compiled
    assert "is_own" in compiled
    assert "manuals.deleted_at IS NULL" in compiled
    assert "source_reused_from_page_id" in compiled
    assert "duplicate_page_count" in compiled


def test_count_user_game_conversations_filters_deleted():
    """El contador ignora conversaciones borradas y ajenas."""

    class FakeResult:
        def scalar_one(self):
            return 7

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    count = anyio.run(
        partial(
            count_user_game_conversations,
            session,
            user_id=_USER_ID,
            game_id=_GAME_ID,
        )
    )

    assert count == 7
    compiled = _compile(session.statement)
    assert "conversations.user_id =" in compiled
    assert "conversations.deleted_at IS NULL" in compiled


def _auth() -> AuthenticatedSession:
    """Construye una sesión autenticada mínima para el servicio."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


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


def _game_row(
    *,
    bgg_id: int | None = 13,
) -> SimpleNamespace:
    """Construye la fila de juego que devuelve el repositorio."""
    return SimpleNamespace(
        id=_GAME_ID,
        name="Catan",
        bgg_id=bgg_id,
        year_published=1995,
        status="active",
    )


def _detail_response() -> GameDetailResponse:
    """Construye una respuesta estable del hub."""
    return GameDetailResponse(
        id=_GAME_ID,
        name="Catan",
        bgg_id=13,
        year_published=1995,
        status="active",
        my_rating={
            "game_id": _GAME_ID,
            "score": 4,
            "note": None,
            "created_at": _NOW,
            "updated_at": _NOW,
        },
        manuals=[
            {
                "id": uuid4(),
                "title": "Edición clásica",
                "source_type": "pdf",
                "page_count": 7,
                "created_at": _NOW,
                "is_own": True,
            }
        ],
        conversations_count=12,
        is_following=True,
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
