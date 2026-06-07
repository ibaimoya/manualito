import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
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
    InvalidEmailVerificationTokenError,
)
from api.auth.service import AuthEmailJob, AuthenticatedSession, LoginResult, RegistrationResult
from api.exceptions import domain_exception_handler
from api.main import app
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.constants import EMAIL_MAX_LENGTH
from database.models.user import User
from database.session import get_db_session

_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial
_FAKE_SESSION_HASH = "a" * 64
_FAKE_CSRF_HASH = "b" * 64
_VALID_TEST_USERNAME = "Manualito"
_VALID_TEST_USERNAME_KEY = _VALID_TEST_USERNAME.casefold()
_VALID_TEST_EMAIL = f"{_VALID_TEST_USERNAME_KEY}@example.com"
_INVALID_TEST_EMAIL = f"{_VALID_TEST_USERNAME_KEY}-invalid-email"
_TOO_LONG_TEST_EMAIL = f"{'a' * EMAIL_MAX_LENGTH}@example.com"
_USERNAME_WITH_AT = f"{_VALID_TEST_USERNAME}@example"
_USERNAME_WITH_INVALID_SYMBOL = f"{_VALID_TEST_USERNAME}!"
_USERNAME_WITH_EMOJI = f"{_VALID_TEST_USERNAME}\U0001f600"
_RATE_LIMIT_TEST_IDENTIFIER = f"rate-{_VALID_TEST_USERNAME_KEY}@example.com"
_FAKE_SESSION_TOKEN = f"session-{_VALID_TEST_USERNAME_KEY}"
_FAKE_CSRF_TOKEN = f"csrf-{_VALID_TEST_USERNAME_KEY}"
_FAKE_ACCOUNT_TOKEN = f"account-{_VALID_TEST_USERNAME_KEY}"
_VALID_TEST_PASSWORD = "x" * config.PASSWORD_MIN_LENGTH
_TOO_SHORT_TEST_PASSWORD = "x" * (config.PASSWORD_MIN_LENGTH - 1)
_TOO_LONG_TEST_PASSWORD = "x" * (config.PASSWORD_MAX_LENGTH + 1)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Aísla los buckets de SlowAPI entre tests de auth."""
    limiter.reset()
    try:
        yield
    finally:
        limiter.reset()


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
            "email": _VALID_TEST_EMAIL,
            "username": _VALID_TEST_USERNAME,
            "password": _VALID_TEST_PASSWORD,
            "role": "admin",
        },
    )

    assert response.status_code == 422
    _assert_error(response.json(), field="role", code="unexpected_field")


@pytest.mark.parametrize(
    ("username", "code"),
    [
        (_USERNAME_WITH_AT, "username_contains_at"),
        (_USERNAME_WITH_INVALID_SYMBOL, "username_invalid_character"),
        (_USERNAME_WITH_EMOJI, "username_invalid_character"),
    ],
)
def test_register_rejects_invalid_username(
    client,
    override_db_session,
    username: str,
    code: str,
):
    """Las reglas avanzadas de username devuelven 422, no error interno."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": _VALID_TEST_EMAIL,
            "username": username,
            "password": _VALID_TEST_PASSWORD,
        },
    )

    assert response.status_code == 422
    _assert_error(response.json(), field="username", code=code)


@pytest.mark.parametrize(
    ("payload", "field", "code"),
    [
        (
            {"username": _VALID_TEST_USERNAME, "password": _VALID_TEST_PASSWORD},
            "email",
            "email_required",
        ),
        (
            {
                "email": _INVALID_TEST_EMAIL,
                "username": _VALID_TEST_USERNAME,
                "password": _VALID_TEST_PASSWORD,
            },
            "email",
            "email_invalid",
        ),
        (
            {
                "email": _TOO_LONG_TEST_EMAIL,
                "username": _VALID_TEST_USERNAME,
                "password": _VALID_TEST_PASSWORD,
            },
            "email",
            "email_too_long",
        ),
        (
            {"email": _VALID_TEST_EMAIL, "password": _VALID_TEST_PASSWORD},
            "username",
            "username_required",
        ),
        (
            {"email": _VALID_TEST_EMAIL, "username": "", "password": _VALID_TEST_PASSWORD},
            "username",
            "username_required",
        ),
        (
            {"email": _VALID_TEST_EMAIL, "username": _VALID_TEST_USERNAME},
            "password",
            "password_required",
        ),
        (
            {
                "email": _VALID_TEST_EMAIL,
                "username": _VALID_TEST_USERNAME,
                "password": _TOO_SHORT_TEST_PASSWORD,
            },
            "password",
            "password_too_short",
        ),
        (
            {
                "email": _VALID_TEST_EMAIL,
                "username": _VALID_TEST_USERNAME,
                "password": _TOO_LONG_TEST_PASSWORD,
            },
            "password",
            "password_too_long",
        ),
    ],
)
def test_register_request_validation_returns_field_error(
    client,
    override_db_session,
    payload: dict[str, str],
    field: str,
    code: str,
):
    """Los errores de schema llegan con field/code estables para formularios."""
    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 422
    body = response.json()
    _assert_error(body, field=field, code=code)
    assert {"input", "type", "url", "password_hash", "username_key"}.isdisjoint(body)


def test_login_sets_session_cookie_and_filters_user_response(
    client,
    monkeypatch,
    override_db_session,
):
    """Login devuelve schema seguro y cookies con flags esperados."""

    monkeypatch.setattr(
        "api.auth.router.login_user",
        AsyncMock(
            return_value=LoginResult(
                user=_user(),
                session_token=_FAKE_SESSION_TOKEN,
                csrf_token=_FAKE_CSRF_TOKEN,
            )
        ),
    )

    response = client.post(
        "/api/auth/login",
        json={"identifier": _VALID_TEST_EMAIL, "password": _VALID_TEST_PASSWORD},
    )

    body = response.json()
    session_cookie = response.headers["set-cookie"]
    assert response.status_code == 200
    assert body["csrf_token"] == _FAKE_CSRF_TOKEN
    assert body["user"]["email"] == _VALID_TEST_EMAIL
    assert body["user"]["email_verified_at"] is None
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
    assert body["csrf_token"] == _FAKE_CSRF_TOKEN
    assert body["user"]["username"] == _VALID_TEST_USERNAME
    assert body["user"]["email_verified_at"] is None
    assert "password_hash" not in body["user"]
    assert "username_key" not in body["user"]


def test_logout_requires_csrf_and_clears_cookies(client, monkeypatch, override_db_session):
    """Logout revoca sesión y borra cookies cuando CSRF ya fue validado."""
    logout_mock = AsyncMock()

    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    monkeypatch.setattr("api.auth.router.logout_session", logout_mock)
    try:
        response = client.post("/api/auth/logout")
    finally:
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)

    assert response.status_code == 204
    assert logout_mock.await_count == 1
    assert f"{config.AUTH_SESSION_COOKIE_NAME}=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]


def test_register_success_sets_session_cookie_and_filters_user_response(
    client,
    monkeypatch,
    override_db_session,
):
    """Registro correcto crea sesión y devuelve el mismo contrato seguro que login."""

    schedule_mock = MagicMock()
    monkeypatch.setattr(
        "api.auth.router.register_user",
        AsyncMock(
            return_value=RegistrationResult(
                user=_user(),
                verification_token=_FAKE_ACCOUNT_TOKEN,
                session_token=_FAKE_SESSION_TOKEN,
                csrf_token=_FAKE_CSRF_TOKEN,
            )
        ),
    )
    monkeypatch.setattr("api.auth.router.schedule_verification_email", schedule_mock)

    response = client.post(
        "/api/auth/register",
        json={
            "email": _VALID_TEST_EMAIL,
            "username": _VALID_TEST_USERNAME,
            "password": _VALID_TEST_PASSWORD,
        },
    )

    body = response.json()
    session_cookie = response.headers["set-cookie"]
    assert response.status_code == 201
    assert body["csrf_token"] == _FAKE_CSRF_TOKEN
    assert body["user"]["username"] == _VALID_TEST_USERNAME
    assert body["user"]["email_verified_at"] is None
    assert "password_hash" not in body["user"]
    assert "username_key" not in body["user"]
    assert config.AUTH_SESSION_COOKIE_NAME in session_cookie
    assert config.AUTH_CSRF_COOKIE_NAME in session_cookie
    assert "HttpOnly" in session_cookie
    assert schedule_mock.call_count == 1


def test_verify_email_uses_token_without_csrf(client, monkeypatch, override_db_session):
    """La verificación se autoriza con token opaco, no con sesión ni CSRF."""
    verify_mock = AsyncMock()
    monkeypatch.setattr("api.auth.router.verify_email_token", verify_mock)

    response = client.post("/api/auth/email/verify", json={"token": _FAKE_ACCOUNT_TOKEN})

    assert response.status_code == 200
    assert response.json()["detail"] == "Email verificado."
    verify_mock.assert_awaited_once()


def test_verify_email_invalid_token_maps_to_400(client, monkeypatch, override_db_session):
    """Un token de verificación inválido devuelve código estable."""
    monkeypatch.setattr(
        "api.auth.router.verify_email_token",
        AsyncMock(side_effect=InvalidEmailVerificationTokenError),
    )

    response = client.post("/api/auth/email/verify", json={"token": _FAKE_ACCOUNT_TOKEN})

    assert response.status_code == 400
    _assert_error(response.json(), field=None, code="email_verification_token_invalid")


def test_resend_verification_email_is_uniform_and_best_effort(
    client,
    monkeypatch,
    override_db_session,
):
    """Reenvío no revela existencia y solo agenda email si el service da job."""
    schedule_mock = MagicMock()
    monkeypatch.setattr(
        "api.auth.router.request_email_verification",
        AsyncMock(
            return_value=AuthEmailJob(
                email=_VALID_TEST_EMAIL,
                username=_VALID_TEST_USERNAME,
                token=_FAKE_ACCOUNT_TOKEN,
            )
        ),
    )
    monkeypatch.setattr("api.auth.router.schedule_verification_email", schedule_mock)

    response = client.post("/api/auth/email/resend", json={"email": _VALID_TEST_EMAIL})

    assert response.status_code == 200
    assert response.json()["detail"].startswith("Si existe una cuenta")
    assert schedule_mock.call_count == 1


def test_forgot_password_is_uniform_and_best_effort(client, monkeypatch, override_db_session):
    """Forgot password no enumera cuentas y agenda email si procede."""
    schedule_mock = MagicMock()
    monkeypatch.setattr(
        "api.auth.router.request_password_reset",
        AsyncMock(
            return_value=AuthEmailJob(
                email=_VALID_TEST_EMAIL,
                username=_VALID_TEST_USERNAME,
                token=_FAKE_ACCOUNT_TOKEN,
            )
        ),
    )
    monkeypatch.setattr("api.auth.router.schedule_password_reset_email", schedule_mock)

    response = client.post("/api/auth/password/forgot", json={"email": _VALID_TEST_EMAIL})

    assert response.status_code == 200
    assert response.json()["detail"].startswith("Si existe una cuenta")
    assert schedule_mock.call_count == 1


def test_reset_password_uses_token_without_csrf(client, monkeypatch, override_db_session):
    """Reset de contraseña se autoriza con token opaco, sin sesión ni CSRF."""
    reset_mock = AsyncMock()
    monkeypatch.setattr("api.auth.router.reset_password_with_token", reset_mock)

    response = client.post(
        "/api/auth/password/reset",
        json={"token": _FAKE_ACCOUNT_TOKEN, "password": _VALID_TEST_PASSWORD},
    )

    assert response.status_code == 200
    assert response.json()["detail"] == "Contraseña actualizada."
    reset_mock.assert_awaited_once()


def test_login_invalid_credentials_maps_to_401(client, monkeypatch, override_db_session):
    """Credenciales inválidas se traducen a 401."""

    monkeypatch.setattr(
        "api.auth.router.login_user", AsyncMock(side_effect=InvalidCredentialsError)
    )

    response = client.post(
        "/api/auth/login",
        json={"identifier": _VALID_TEST_EMAIL, "password": _TOO_SHORT_TEST_PASSWORD},
    )

    assert response.status_code == 401
    _assert_error(response.json(), field=None, code="invalid_credentials")


def test_register_duplicate_identity_maps_to_409(client, monkeypatch, override_db_session):
    """Email o username ya en uso se traduce a 409."""

    monkeypatch.setattr(
        "api.auth.router.register_user", AsyncMock(side_effect=DuplicateIdentityError)
    )

    response = client.post(
        "/api/auth/register",
        json={
            "email": _VALID_TEST_EMAIL,
            "username": _VALID_TEST_USERNAME,
            "password": _VALID_TEST_PASSWORD,
        },
    )

    assert response.status_code == 409
    _assert_error(response.json(), field=None, code="identity_unavailable")


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
    _assert_error(response.json(), field=None, code="authentication_required")


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
    _assert_error(response.json(), field=None, code="invalid_csrf_token")


def test_admin_required_handler_maps_to_403():
    """El handler de AdminRequiredError responde 403 (aún sin ruta admin)."""
    response = domain_exception_handler(None, AdminRequiredError())

    assert response.status_code == 403
    _assert_error(_json_body(response), field=None, code="admin_required")


def test_login_rate_limited_after_five_attempts(client, monkeypatch, override_db_session):
    """El 6.o login en la ventana recibe 429 (freno anti fuerza bruta)."""

    monkeypatch.setattr(
        "api.auth.router.login_user", AsyncMock(side_effect=InvalidCredentialsError)
    )
    responses = [
        client.post(
            "/api/auth/login",
            json={
                "identifier": _RATE_LIMIT_TEST_IDENTIFIER,
                "password": _TOO_SHORT_TEST_PASSWORD,
            },
        )
        for _ in range(6)
    ]
    codes = [response.status_code for response in responses]

    assert codes[:5] == [401, 401, 401, 401, 401]
    assert codes[5] == 429
    _assert_error(responses[5].json(), field=None, code="rate_limited")


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=uuid4(),
            token_hash=_FAKE_SESSION_HASH,
            csrf_token_hash=_FAKE_CSRF_HASH,
            expires_at=datetime(2026, 5, 29, tzinfo=UTC) + timedelta(days=7),
        ),
        session_token=_FAKE_SESSION_TOKEN,
        csrf_token=_FAKE_CSRF_TOKEN,
    )


def _assert_error(body: dict, *, field: str | None, code: str) -> None:
    """Comprueba un error público sin depender del texto visible."""
    assert "detail" in body
    assert any(
        error["field"] == field and error["code"] == code
        for error in body["errors"]
    )


def _json_body(response) -> dict:
    """Decodifica respuestas directas de handlers sin TestClient."""
    return json.loads(response.body)


def _user() -> User:
    """Crea un usuario ORM sin campos sensibles en las respuestas esperadas."""
    return User(
        id=uuid4(),
        email=_VALID_TEST_EMAIL,
        username=_VALID_TEST_USERNAME,
        username_key=_VALID_TEST_USERNAME_KEY,
        password_hash=_FAKE_HASH,
        role="user",
        status="active",
        created_at=datetime(2026, 5, 29, tzinfo=UTC),
        email_verified_at=None,
        last_login_at=None,
        password_changed_at=datetime(2026, 5, 29, tzinfo=UTC),
    )

