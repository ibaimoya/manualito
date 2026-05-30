from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from api import config
from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.exceptions import (
    AdminRequiredError,
    AuthenticationRequiredError,
    DuplicateIdentityError,
    InvalidCredentialsError,
    InvalidCsrfTokenError,
)
from api.auth.service import AuthenticatedSession, LoginResult
from api.exceptions import admin_required_handler
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture
def override_db_session():
    """Inyecta una sesión falsa para endpoints que delegan en service."""

    def _fake_db_session() -> Iterator[object]:
        yield object()

    app.dependency_overrides[get_db_session] = _fake_db_session
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)


def test_register_rejects_role_escalation(client, override_db_session):
    """El schema de registro no acepta role enviado por el cliente."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "username": "Nora",
            "password": "valid-password",
            "role": "admin",
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("username", ["user@example", "emoji😀"])
def test_register_rejects_invalid_username(client, override_db_session, username: str):
    """Las reglas avanzadas de username devuelven 422, no error interno."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "user@example.com",
            "username": username,
            "password": "valid-password",
        },
    )

    assert response.status_code == 422


def test_login_sets_session_cookie_and_filters_user_response(
    client,
    monkeypatch,
    override_db_session,
):
    """Login devuelve schema seguro y cookies con flags esperados."""

    monkeypatch.setattr(
        "api.routes.auth.login_user",
        AsyncMock(
            return_value=LoginResult(
                user=_user(),
                session_token="session-token",
                csrf_token="csrf-token",
            )
        ),
    )

    response = client.post(
        "/api/auth/login",
        json={"identifier": "user@example.com", "password": "valid-password"},
    )

    body = response.json()
    session_cookie = response.headers["set-cookie"]
    assert response.status_code == 200
    assert body["csrf_token"] == "csrf-token"
    assert body["user"]["email"] == "user@example.com"
    assert "password_hash" not in body["user"]
    assert "username_key" not in body["user"]
    assert config.AUTH_SESSION_COOKIE_NAME in session_cookie
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Path=/" in session_cookie


def test_me_returns_public_user_and_csrf_token(client):
    """GET /api/me usa el schema público y expone CSRF para boot del frontend."""

    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    try:
        response = client.get("/api/me")
    finally:
        app.dependency_overrides.pop(get_current_auth, None)

    body = response.json()
    assert response.status_code == 200
    assert body["csrf_token"] == "csrf-token"
    assert body["user"]["username"] == "Nora"
    assert "password_hash" not in body["user"]
    assert "username_key" not in body["user"]


def test_logout_requires_csrf_and_clears_cookies(client, monkeypatch, override_db_session):
    """Logout revoca sesión y borra cookies cuando CSRF ya fue validado."""
    logout_mock = AsyncMock()

    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    monkeypatch.setattr("api.routes.auth.logout_session", logout_mock)
    try:
        response = client.post("/api/auth/logout")
    finally:
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)

    assert response.status_code == 204
    assert logout_mock.await_count == 1
    assert f"{config.AUTH_SESSION_COOKIE_NAME}=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_register_success_returns_public_user(client, monkeypatch, override_db_session):
    """Registro correcto devuelve 201 con el contrato público, sin campos sensibles."""

    monkeypatch.setattr("api.routes.auth.register_user", AsyncMock(return_value=_user()))

    response = client.post(
        "/api/auth/register",
        json={"email": "user@example.com", "username": "Nora", "password": "valid-password"},
    )

    body = response.json()
    assert response.status_code == 201
    assert body["username"] == "Nora"
    assert "password_hash" not in body
    assert "username_key" not in body


def test_login_invalid_credentials_maps_to_401(client, monkeypatch, override_db_session):
    """Credenciales inválidas se traducen a 401."""

    monkeypatch.setattr(
        "api.routes.auth.login_user", AsyncMock(side_effect=InvalidCredentialsError)
    )

    response = client.post(
        "/api/auth/login",
        json={"identifier": "user@example.com", "password": "bad-password"},
    )

    assert response.status_code == 401


def test_register_duplicate_identity_maps_to_409(client, monkeypatch, override_db_session):
    """Email o username ya en uso se traduce a 409."""

    monkeypatch.setattr(
        "api.routes.auth.register_user", AsyncMock(side_effect=DuplicateIdentityError)
    )

    response = client.post(
        "/api/auth/register",
        json={"email": "user@example.com", "username": "Nora", "password": "valid-password"},
    )

    assert response.status_code == 409


def test_me_without_session_maps_to_401(client):
    """GET /api/me sin sesión válida devuelve 401."""

    def raise_auth_required() -> AuthenticatedSession:
        raise AuthenticationRequiredError

    app.dependency_overrides[get_current_auth] = raise_auth_required
    try:
        response = client.get("/api/me")
    finally:
        app.dependency_overrides.pop(get_current_auth, None)

    assert response.status_code == 401


def test_logout_invalid_csrf_maps_to_403(client, override_db_session):
    """Logout con CSRF inválido devuelve 403."""

    def raise_invalid_csrf() -> None:
        raise InvalidCsrfTokenError

    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = raise_invalid_csrf
    try:
        response = client.post("/api/auth/logout")
    finally:
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)

    assert response.status_code == 403


def test_admin_required_handler_maps_to_403():
    """El handler de AdminRequiredError responde 403 (aún sin ruta admin)."""
    response = admin_required_handler(None, AdminRequiredError())

    assert response.status_code == 403


def test_login_rate_limited_after_five_attempts(client, monkeypatch, override_db_session):
    """El 6.o login en la ventana recibe 429 (freno anti fuerza bruta)."""

    monkeypatch.setattr(
        "api.routes.auth.login_user", AsyncMock(side_effect=InvalidCredentialsError)
    )
    limiter.reset()  # parte de un cubo limpio: no arrastra llamadas de otros tests
    try:
        codes = [
            client.post(
                "/api/auth/login",
                json={"identifier": "nora@example.com", "password": "bad-password"},
            ).status_code
            for _ in range(6)
        ]
    finally:
        limiter.reset()  # no deja el cubo agotado para los tests siguientes

    assert codes[:5] == [401, 401, 401, 401, 401]
    assert codes[5] == 429


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=uuid4(),
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=datetime(2026, 5, 29, tzinfo=UTC) + timedelta(days=7),
        ),
        session_token="session-token",
        csrf_token="csrf-token",
    )


def _user() -> User:
    """Crea un usuario ORM sin campos sensibles en las respuestas esperadas."""
    return User(
        id=uuid4(),
        email="user@example.com",
        username="Nora",
        username_key="nora",
        password_hash=_FAKE_HASH,
        role="user",
        status="active",
        created_at=datetime(2026, 5, 29, tzinfo=UTC),
        last_login_at=None,
        password_changed_at=datetime(2026, 5, 29, tzinfo=UTC),
    )
