from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

import api.account.service as account_service
from api.account.repository import get_user_activity_stats
from api.account.schemas import MeStatsResponse
from api.account.service import (
    ProfileUpdateResult,
    change_password,
    get_account_stats,
    update_profile,
)
from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.exceptions import DuplicateIdentityError, InvalidCredentialsError
from api.auth.service import AuthEmailJob, AuthenticatedSession
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_SESSION_ID = uuid4()
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_VALID_PASSWORD = "meeple-azul-91"


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para los endpoints de cuenta."""

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


def test_me_stats_returns_aggregated_activity(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El perfil obtiene sus contadores en una sola llamada."""
    stats_mock = AsyncMock(
        return_value=MeStatsResponse(games_count=6, conversations_count=23, manuals_count=9)
    )
    monkeypatch.setattr("api.account.router.get_account_stats", stats_mock)

    response = client.get("/api/me/stats")

    assert response.status_code == 200
    assert response.json() == {
        "games_count": 6,
        "conversations_count": 23,
        "manuals_count": 9,
    }
    stats_mock.assert_awaited_once()


def test_update_profile_returns_public_user(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Editar el perfil devuelve el contrato público actualizado."""
    update_mock = AsyncMock(
        return_value=ProfileUpdateResult(user=_user(username="marta_a"), email_job=None)
    )
    email_mock = AsyncMock()
    monkeypatch.setattr("api.account.router.update_profile", update_mock)
    monkeypatch.setattr("api.account.router.schedule_verification_email", email_mock)

    response = client.patch("/api/me", json={"username": "marta_a"})

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "marta_a"
    update_mock.assert_awaited_once()
    assert update_mock.await_args.kwargs["username"] == "marta_a"
    assert update_mock.await_args.kwargs["email"] is None
    email_mock.assert_not_called()


def test_update_profile_with_email_schedules_verification(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Cambiar el email agenda el correo con el token recién emitido."""
    email_job = AuthEmailJob(email="nueva@example.com", username="Manualito", token="token-123")
    update_mock = AsyncMock(
        return_value=ProfileUpdateResult(
            user=_user(email="nueva@example.com"),
            email_job=email_job,
        )
    )
    scheduled: list[dict] = []

    def fake_schedule(background_tasks, **kwargs):
        scheduled.append(kwargs)

    monkeypatch.setattr("api.account.router.update_profile", update_mock)
    monkeypatch.setattr("api.account.router.schedule_verification_email", fake_schedule)

    response = client.patch("/api/me", json={"email": "nueva@example.com"})

    assert response.status_code == 200
    assert response.json()["user"]["email_verified_at"] is None
    assert scheduled == [
        {"to_email": "nueva@example.com", "username": "Manualito", "token": "token-123"}
    ]


def test_update_profile_duplicate_identity_returns_409(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un username ocupado responde el mismo 409 estable del registro."""
    monkeypatch.setattr(
        "api.account.router.update_profile",
        AsyncMock(side_effect=DuplicateIdentityError),
    )

    response = client.patch("/api/me", json={"username": "ocupado"})

    assert response.status_code == 409
    assert any(
        error["code"] == "identity_unavailable" for error in response.json()["errors"]
    )


def test_update_profile_rejects_unknown_avatar_values(
    client,
    override_auth_and_db,
):
    """Colores y figuras fuera del catálogo cerrado devuelven 422."""
    bad_color = client.patch("/api/me", json={"avatar_color": "magenta"})
    bad_figure = client.patch("/api/me", json={"avatar_figure": "dragon"})

    assert bad_color.status_code == 422
    assert bad_figure.status_code == 422
    assert bad_color.json()["errors"][0]["field"] == "avatar_color"


def test_change_password_delegates_and_confirms(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El cambio de contraseña delega con la sesión actual para preservarla."""
    change_mock = AsyncMock()
    monkeypatch.setattr("api.account.router.change_password", change_mock)

    response = client.post(
        "/api/me/password",
        json={"current_password": "la-anterior-123", "new_password": _VALID_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["detail"] == "Contraseña actualizada."
    change_mock.assert_awaited_once()
    assert change_mock.await_args.kwargs["new_password"] == _VALID_PASSWORD


def test_change_password_wrong_current_returns_401(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Una contraseña actual incorrecta responde credenciales inválidas."""
    monkeypatch.setattr(
        "api.account.router.change_password",
        AsyncMock(side_effect=InvalidCredentialsError),
    )

    response = client.post(
        "/api/me/password",
        json={"current_password": "equivocada", "new_password": _VALID_PASSWORD},
    )

    assert response.status_code == 401
    assert any(
        error["code"] == "invalid_credentials" for error in response.json()["errors"]
    )


def test_change_password_short_new_returns_public_code(
    client,
    override_auth_and_db,
):
    """Una contraseña nueva corta devuelve el código estable de formulario."""
    response = client.post(
        "/api/me/password",
        json={"current_password": "la-anterior-123", "new_password": "corta"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["errors"][0]["field"] == "new_password"
    assert body["errors"][0]["code"] == "password_too_short"


def test_change_password_is_rate_limited(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El cambio de contraseña tiene freno agresivo propio."""
    change_mock = AsyncMock()
    monkeypatch.setattr("api.account.router.change_password", change_mock)

    responses = [
        client.post(
            "/api/me/password",
            json={"current_password": "la-anterior-123", "new_password": _VALID_PASSWORD},
        )
        for _index in range(6)
    ]

    assert responses[-1].status_code == 429
    assert change_mock.await_count == 5


def test_update_profile_service_changes_username_and_audits(monkeypatch):
    """Renombrar usuario recalcula la clave y deja huella de auditoría."""
    user = _service_user()
    session = _service_session()
    events: list[str] = []
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **kwargs: events.append(kwargs["event_type"]),
    )

    result = anyio.run(
        partial(
            update_profile,
            session,
            auth=_service_auth(user),
            username="Marta_A",
            email=None,
            avatar_color=None,
            avatar_figure=None,
            ip_address="203.0.113.7",
        )
    )

    assert result.user.username == "Marta_A"
    assert result.user.username_key == "marta_a"
    assert result.email_job is None
    assert events == ["profile_updated"]
    assert session.flushes == 1
    assert session.commits == 1
    assert session.refreshes == 1


def test_update_profile_service_email_change_resets_verification(monkeypatch):
    """Cambiar email invalida la verificación y rota el token único."""
    user = _service_user(email_verified_at=_NOW)
    session = _service_session()
    rotate_mock = AsyncMock(return_value="token-nuevo")
    monkeypatch.setattr(account_service, "rotate_email_verification_token", rotate_mock)
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **_kwargs: None,
    )

    result = anyio.run(
        partial(
            update_profile,
            session,
            auth=_service_auth(user),
            username=None,
            email="  Nueva@Example.com ",
            avatar_color=None,
            avatar_figure=None,
            ip_address=None,
        )
    )

    assert result.user.email == "nueva@example.com"
    assert result.user.email_verified_at is None
    assert result.email_job == AuthEmailJob(
        email="nueva@example.com",
        username=user.username,
        token="token-nuevo",
    )
    rotate_mock.assert_awaited_once()


def test_update_profile_service_changes_avatar(monkeypatch):
    """Elegir color y figura del avatar persiste ambos campos."""
    user = _service_user()
    session = _service_session()
    events: list[dict] = []
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **kwargs: events.append(kwargs["event_data"]),
    )

    result = anyio.run(
        partial(
            update_profile,
            session,
            auth=_service_auth(user),
            username=None,
            email=None,
            avatar_color="accent",
            avatar_figure="meeple",
            ip_address=None,
        )
    )

    assert result.user.avatar_color == "accent"
    assert result.user.avatar_figure == "meeple"
    assert events == [{"fields": ["avatar_color", "avatar_figure"]}]
    assert session.commits == 1


def test_update_profile_service_noop_rolls_back(monkeypatch):
    """Enviar los mismos valores no escribe ni audita nada."""
    user = _service_user()
    session = _service_session()
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **_kwargs: pytest.fail("no debe auditar un no-op"),
    )

    result = anyio.run(
        partial(
            update_profile,
            session,
            auth=_service_auth(user),
            username=user.username,
            email=user.email,
            avatar_color=None,
            avatar_figure=None,
            ip_address=None,
        )
    )

    assert result.email_job is None
    assert session.rollbacks == 1
    assert session.commits == 0
    assert session.flushes == 0


def test_update_profile_service_duplicate_flush_raises_409(monkeypatch):
    """La carrera del username duplicado la resuelve el índice único."""
    user = _service_user()
    session = _service_session(
        flush_error=IntegrityError("stmt", "params", Exception("dup")),
    )
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **_kwargs: None,
    )

    with pytest.raises(DuplicateIdentityError):
        anyio.run(
            partial(
                update_profile,
                session,
                auth=_service_auth(user),
                username="otra",
                email=None,
                avatar_color=None,
                avatar_figure=None,
                ip_address=None,
            )
        )

    assert session.rollbacks == 1
    assert session.commits == 0


def test_change_password_service_rejects_wrong_current(monkeypatch):
    """Con la contraseña actual mal, no se toca el hash ni las sesiones."""
    user = _service_user()
    original_hash = user.password_hash
    session = _service_session()
    events: list[tuple[str, bool]] = []
    monkeypatch.setattr(
        account_service,
        "verify_password_async",
        AsyncMock(return_value=(False, None)),
    )
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **kwargs: events.append((kwargs["event_type"], kwargs["success"])),
    )

    with pytest.raises(InvalidCredentialsError):
        anyio.run(
            partial(
                change_password,
                session,
                auth=_service_auth(user),
                current_password="equivocada",
                new_password=_VALID_PASSWORD,
                ip_address=None,
            )
        )

    assert user.password_hash == original_hash
    assert events == [("password_change_failed", False)]
    assert session.commits == 1
    assert session.statements == []


def test_change_password_service_revokes_other_sessions(monkeypatch):
    """El cambio correcto rota el hash y revoca el resto de sesiones."""
    user = _service_user()
    session = _service_session()
    events: list[str] = []
    monkeypatch.setattr(
        account_service,
        "verify_password_async",
        AsyncMock(return_value=(True, None)),
    )
    monkeypatch.setattr(
        account_service,
        "hash_password_async",
        AsyncMock(return_value="hash-nuevo"),
    )
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **kwargs: events.append(kwargs["event_type"]),
    )

    anyio.run(
        partial(
            change_password,
            session,
            auth=_service_auth(user),
            current_password="la-anterior-123",
            new_password=_VALID_PASSWORD,
            ip_address=None,
        )
    )

    assert user.password_hash == "hash-nuevo"
    assert user.password_changed_at is not None
    assert events == ["password_changed"]
    assert session.commits == 1
    compiled = _compile(session.statements[0])
    assert "UPDATE auth_sessions" in compiled
    assert "auth_sessions.revoked_at IS NULL" in compiled
    assert "auth_sessions.id !=" in compiled


def test_get_account_stats_validates_repository_row(monkeypatch):
    """El servicio convierte la fila agregada en contrato público."""
    monkeypatch.setattr(
        "api.account.service.repository.get_user_activity_stats",
        AsyncMock(
            return_value=SimpleNamespace(
                games_count=2,
                conversations_count=5,
                manuals_count=1,
            )
        ),
    )

    stats = anyio.run(
        partial(get_account_stats, _FAKE_SESSION, auth=_service_auth(_service_user()))
    )

    assert stats == MeStatsResponse(games_count=2, conversations_count=5, manuals_count=1)


def test_get_user_activity_stats_unions_games_with_activity():
    """Los juegos cuentan actividad de manuales, conversaciones y ratings."""

    class FakeResult:
        def one(self):
            return SimpleNamespace(games_count=3, conversations_count=4, manuals_count=2)

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    row = anyio.run(partial(get_user_activity_stats, session, user_id=_USER_ID))

    assert row.games_count == 3
    compiled = _compile(session.statement)
    assert "UNION" in compiled
    assert "manuals.owner_user_id" in compiled
    assert "conversations.deleted_at IS NULL" in compiled
    assert "ratings.user_id" in compiled


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            id=_SESSION_ID,
            user_id=_USER_ID,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=_NOW + timedelta(days=7),
        ),
        session_token="session-manualito",
        csrf_token="csrf-manualito",
    )


def _user(
    *,
    username: str = "Manualito",
    email: str = "manualito@example.com",
) -> User:
    """Crea un usuario ORM mínimo para respuestas públicas."""
    return User(
        id=_USER_ID,
        email=email,
        username=username,
        username_key=username.casefold(),
        password_hash="hash-value",
        role="user",
        status="active",
        created_at=_NOW,
        last_login_at=None,
        email_verified_at=None,
        password_changed_at=_NOW,
    )


def _service_user(*, email_verified_at: datetime | None = None) -> SimpleNamespace:
    """Construye un usuario mutable para los casos de uso."""
    return SimpleNamespace(
        id=_USER_ID,
        email="manualito@example.com",
        username="Manualito",
        username_key="manualito",
        password_hash="hash-anterior",
        password_changed_at=None,
        email_verified_at=email_verified_at,
        avatar_color=None,
        avatar_figure=None,
    )


def _service_auth(user) -> SimpleNamespace:
    """Construye la sesión autenticada que reciben los servicios."""
    return SimpleNamespace(user=user, auth_session=SimpleNamespace(id=_SESSION_ID))


def _service_session(*, flush_error: Exception | None = None) -> SimpleNamespace:
    """Construye una sesión falsa con contadores observables."""
    session = SimpleNamespace(
        commits=0,
        rollbacks=0,
        flushes=0,
        refreshes=0,
        statements=[],
    )

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1

    async def flush():
        await anyio.lowlevel.checkpoint()
        if flush_error is not None:
            raise flush_error
        session.flushes += 1

    async def refresh(_instance):
        await anyio.lowlevel.checkpoint()
        session.refreshes += 1

    async def execute(statement):
        await anyio.lowlevel.checkpoint()
        session.statements.append(statement)

    session.commit = commit
    session.rollback = rollback
    session.flush = flush
    session.refresh = refresh
    session.execute = execute
    session.add = lambda _instance: None
    return session


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
