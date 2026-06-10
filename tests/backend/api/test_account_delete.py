from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

import api.account.service as account_service
from api.account.repository import AccountCleanup, purge_user_account
from api.account.service import delete_account
from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.exceptions import AuthFormValidationError
from api.auth.service import AuthenticatedSession
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_MANUAL_ID = uuid4()
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para el endpoint de borrado."""

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


def test_delete_account_returns_204_and_clears_cookies(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El borrado confirmado responde sin cuerpo y expira las cookies."""
    delete_mock = AsyncMock()
    monkeypatch.setattr("api.account.router.delete_account", delete_mock)

    response = client.request("DELETE", "/api/me", json={"username": "Manualito"})

    assert response.status_code == 204
    assert response.content == b""
    set_cookie = response.headers.get("set-cookie", "")
    assert "manualito_session" in set_cookie
    delete_mock.assert_awaited_once()
    assert delete_mock.await_args.kwargs["username_confirmation"] == "Manualito"


def test_delete_account_wrong_confirmation_returns_form_error(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Una confirmación que no coincide devuelve error de formulario estable."""
    monkeypatch.setattr(
        "api.account.router.delete_account",
        AsyncMock(
            side_effect=AuthFormValidationError(
                account_service.AuthFieldError(
                    field="username",
                    code="username_confirmation_mismatch",
                    message="El nombre de usuario no coincide con tu cuenta.",
                )
            )
        ),
    )

    response = client.request("DELETE", "/api/me", json={"username": "otra"})

    assert response.status_code == 422
    body = response.json()
    assert body["errors"][0]["field"] == "username"
    assert body["errors"][0]["code"] == "username_confirmation_mismatch"


def test_delete_account_is_rate_limited(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El borrado de cuenta tiene el freno más agresivo de la API."""
    delete_mock = AsyncMock()
    monkeypatch.setattr("api.account.router.delete_account", delete_mock)

    responses = [
        client.request("DELETE", "/api/me", json={"username": "Manualito"})
        for _index in range(4)
    ]

    assert responses[-1].status_code == 429
    assert delete_mock.await_count == 3


def test_delete_account_service_requires_matching_confirmation(monkeypatch):
    """Sin confirmación correcta no se ejecuta ninguna escritura."""
    purge_mock = AsyncMock()
    monkeypatch.setattr(account_service.repository, "purge_user_account", purge_mock)

    with pytest.raises(AuthFormValidationError):
        anyio.run(
            partial(
                delete_account,
                _FAKE_SESSION,
                auth=_service_auth(),
                username_confirmation="Equivocado",
                client=object(),
                ip_address=None,
            )
        )

    purge_mock.assert_not_called()


def test_delete_account_service_rejects_blank_confirmation(monkeypatch):
    """Una confirmación en blanco se trata como no coincidente, sin reventar."""
    purge_mock = AsyncMock()
    monkeypatch.setattr(account_service.repository, "purge_user_account", purge_mock)

    with pytest.raises(AuthFormValidationError):
        anyio.run(
            partial(
                delete_account,
                _FAKE_SESSION,
                auth=_service_auth(),
                username_confirmation="   ",
                client=object(),
                ip_address=None,
            )
        )

    purge_mock.assert_not_called()


def test_delete_account_service_accepts_case_insensitive_confirmation(monkeypatch):
    """La confirmación compara por clave normalizada, no por mayúsculas."""
    session = _service_session()
    cleanup = AccountCleanup(chunk_ids_by_manual={}, storage_keys=[])
    purge_mock = AsyncMock(return_value=cleanup)
    events: list[str] = []
    monkeypatch.setattr(account_service.repository, "purge_user_account", purge_mock)
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **kwargs: events.append(kwargs["event_type"]),
    )

    anyio.run(
        partial(
            delete_account,
            session,
            auth=_service_auth(),
            username_confirmation="manualito",
            client=object(),
            ip_address="203.0.113.7",
        )
    )

    purge_mock.assert_awaited_once()
    assert events == ["account_deleted"]
    assert session.commits == 1


def test_delete_account_service_cleans_storage_and_chroma_after_commit(monkeypatch):
    """Tras el commit se limpian ficheros y chunks por manual, best-effort."""
    session = _service_session()
    chunk_ids = [uuid4(), uuid4()]
    cleanup = AccountCleanup(
        chunk_ids_by_manual={_MANUAL_ID: chunk_ids},
        storage_keys=["assets/a.jpg", "assets/b.jpg"],
    )
    storage_mock = AsyncMock(side_effect=[True, False])
    rag_mock = AsyncMock()
    monkeypatch.setattr(
        account_service.repository,
        "purge_user_account",
        AsyncMock(return_value=cleanup),
    )
    monkeypatch.setattr(account_service, "delete_stored_file", storage_mock)
    monkeypatch.setattr(account_service, "delete_chunks_from_rag", rag_mock)
    monkeypatch.setattr(
        account_service,
        "record_security_event",
        lambda _session, **_kwargs: None,
    )

    anyio.run(
        partial(
            delete_account,
            session,
            auth=_service_auth(),
            username_confirmation="Manualito",
            client=object(),
            ip_address=None,
        )
    )

    assert storage_mock.await_count == 2
    rag_mock.assert_awaited_once()
    assert rag_mock.await_args.kwargs["manual_id"] == _MANUAL_ID
    assert rag_mock.await_args.kwargs["chunk_ids"] == chunk_ids
    assert session.commits == 1


def test_purge_user_account_soft_deletes_everything_without_commit():
    """La purga encadena todas las escrituras y deja el commit al servicio."""
    statements = []
    chunk_row = SimpleNamespace(manual_id=_MANUAL_ID, id=uuid4())

    class FakeSession:
        def __init__(self):
            self.commits = 0
            self.calls = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.calls += 1
            statements.append(statement)
            if self.calls == 1:
                return [chunk_row]
            if self.calls == 2:
                return SimpleNamespace(scalars=lambda: ["assets/a.jpg"])
            return SimpleNamespace(rowcount=1)

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    cleanup = anyio.run(
        partial(purge_user_account, session, user_id=_USER_ID, now=_NOW)
    )

    assert cleanup.chunk_ids_by_manual == {_MANUAL_ID: [chunk_row.id]}
    assert cleanup.storage_keys == ["assets/a.jpg"]
    assert session.commits == 0
    compiled = [_compile(statement) for statement in statements]
    writes = "\n".join(compiled[2:])
    assert "UPDATE manuals SET" in writes
    assert "UPDATE assets SET" in writes
    assert "UPDATE conversations SET" in writes
    assert "DELETE FROM ratings" in writes
    assert "DELETE FROM game_explanations" in writes
    assert "UPDATE auth_sessions SET revoked_at" in writes
    assert "UPDATE users SET status" in writes


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=_USER_ID,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=_NOW + timedelta(days=7),
        ),
        session_token="session-manualito",
        csrf_token="csrf-manualito",
    )


def _user() -> User:
    """Crea un usuario ORM mínimo dueño de la cuenta a borrar."""
    return User(
        id=_USER_ID,
        email="manualito@example.com",
        username="Manualito",
        username_key="manualito",
        password_hash="hash-value",
        role="user",
        status="active",
        created_at=_NOW,
        last_login_at=None,
        password_changed_at=_NOW,
    )


def _service_auth() -> SimpleNamespace:
    """Construye la sesión autenticada que recibe el servicio."""
    return SimpleNamespace(
        user=SimpleNamespace(id=_USER_ID, username="Manualito", username_key="manualito"),
        auth_session=SimpleNamespace(id=uuid4()),
    )


def _service_session() -> SimpleNamespace:
    """Construye una sesión falsa con commit observable."""
    session = SimpleNamespace(commits=0)

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.commit = commit
    session.add = lambda _instance: None
    return session


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
