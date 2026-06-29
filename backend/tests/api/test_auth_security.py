from datetime import UTC, datetime, timedelta
from typing import cast
from unittest.mock import AsyncMock, call
from uuid import uuid4

import pytest
from fastapi import Request, Response
from sqlalchemy import Select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.auth import passwords as password_helpers
from api.auth import service
from api.auth.audit import record_security_event
from api.auth.cookies import set_auth_cookies
from api.auth.dependencies import client_ip, get_current_auth, require_admin, require_csrf
from api.auth.exceptions import (
    AdminRequiredError,
    AuthenticationRequiredError,
    InvalidCredentialsError,
    InvalidCsrfTokenError,
    InvalidEmailVerificationTokenError,
    InvalidPasswordResetTokenError,
)
from api.auth.passwords import (
    PasswordValidationError,
    hash_password,
    validate_password_policy,
    verify_password,
    verify_password_against_dummy,
)
from api.auth.tokens import generate_opaque_token, hash_token, token_matches
from database.models.audit import AuditLog
from database.models.auth import AuthSession, EmailVerificationToken, PasswordResetToken
from database.models.user import User

_FAKE_HASH = "hash"  # placeholder de hash en fixtures, no es una credencial
_SENSITIVE = "stripped"  # relleno para claves que el audit_log debe descartar


class FakeSession:
    """Session mínima para probar casos de uso sin Postgres real.

    Los métodos async de ``AsyncSession`` (que el service ``await``ea) se simulan
    con ``AsyncMock`` para que sean awaitables; la lógica con estado vive en los
    ``_impl`` síncronos.
    """

    def __init__(self, scalar_result=None, row_result=None):
        self.added = []
        self.commits = 0
        self.rollbacks = 0
        self.refreshed = []
        self.statements = []
        self.scalar_result = scalar_result
        self.row_result = row_result
        self.execute = AsyncMock(side_effect=self._execute)
        self.flush = AsyncMock(side_effect=self._flush)
        self.commit = AsyncMock(side_effect=self._commit)
        self.rollback = AsyncMock(side_effect=self._rollback)
        self.refresh = AsyncMock(side_effect=self._refresh)

    def add(self, instance):
        """Captura instancias pendientes como haría AsyncSession.add()."""
        self.added.append(instance)

    def _execute(self, statement):
        """Guarda la query y devuelve un resultado controlado."""
        self.statements.append(statement)
        if self.row_result is not None:
            return FakeRowResult(self.row_result)
        return FakeScalarResult(self.scalar_result)

    def _flush(self):
        """No hace nada porque no hay base de datos real."""

    def _commit(self):
        """Cuenta commits para verificar persistencia esperada."""
        self.commits += 1

    def _rollback(self):
        """Cuenta rollbacks para escenarios de error."""
        self.rollbacks += 1

    def _refresh(self, instance):
        """Marca una instancia como refrescada."""
        self.refreshed.append(instance)


class FakeScalarResult:
    """Resultado escalar compatible con scalar_one_or_none()."""

    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        """Devuelve el valor preparado por el test."""
        return self.value


class FakeRowResult:
    """Resultado de tupla compatible con tuples().one_or_none()."""

    def __init__(self, value):
        self.value = value

    def tuples(self):
        """Devuelve el mismo resultado preparado."""
        return self

    def one_or_none(self):
        """Devuelve la tupla preparada por el test."""
        return self.value


@pytest.mark.parametrize("password", ["x" * 12, "contraseña larga con espacios"])
def test_validate_password_policy_accepts_minimum_length(password: str):
    """La política propia permite cualquier carácter y se centra en longitud."""
    validate_password_policy(password)


@pytest.mark.parametrize(
    ("password", "code"),
    [
        ("short", "password_too_short"),
        ("x" * 129, "password_too_long"),
    ],
)
def test_validate_password_policy_rejects_out_of_bounds(password: str, code: str):
    """La contraseña debe tener longitud entre 12 y 128 caracteres."""
    with pytest.raises(PasswordValidationError) as exc_info:
        validate_password_policy(password)

    error = exc_info.value.errors[0]
    assert error.field == "password"
    assert error.code == code
    assert error.message


def test_tokens_are_opaque_and_hashed():
    """Los tokens crudos tienen alta entropía y en DB se guarda SHA-256 hex."""
    token = generate_opaque_token()
    token_hash = hash_token(token)

    assert len(token) >= 43
    assert len(token_hash) == 64
    assert token not in token_hash
    assert token_matches(token, token_hash)
    assert not token_matches("otro-token", token_hash)


def test_hash_password_uses_argon2id_with_current_recommended_parameters():
    """pwdlib recommended usa Argon2id con coste superior al mínimo OWASP."""
    password_hash = hash_password("valid-password")

    assert password_hash.startswith("$argon2id$")
    assert "$m=65536,t=3,p=4$" in password_hash


@pytest.mark.anyio
async def test_password_async_wrappers_use_limited_worker_thread(monkeypatch):
    """Los wrappers async sacan Argon2 del event loop con el limitador propio."""

    def run_sync_side_effect(function, *args, limiter):
        """Devuelve resultados controlados al await del AsyncMock."""
        if function is password_helpers.hash_password:
            return "hash-value"
        if function is password_helpers.verify_password:
            return True, "new-hash"
        return None

    run_sync_mock = AsyncMock(side_effect=run_sync_side_effect)
    monkeypatch.setattr(password_helpers.anyio.to_thread, "run_sync", run_sync_mock)

    hashed = await password_helpers.hash_password_async("valid-password")
    verified = await password_helpers.verify_password_async("valid-password", "old-hash")
    dummy = await password_helpers.verify_password_against_dummy_async("valid-password")

    assert hashed == "hash-value"
    assert verified == (True, "new-hash")
    assert dummy is None
    assert password_helpers._PASSWORD_HASH_LIMITER.total_tokens == (
        config.PASSWORD_HASH_CONCURRENCY
    )
    assert run_sync_mock.await_args_list == [
        call(
            password_helpers.hash_password,
            "valid-password",
            limiter=password_helpers._PASSWORD_HASH_LIMITER,
        ),
        call(
            password_helpers.verify_password,
            "valid-password",
            "old-hash",
            limiter=password_helpers._PASSWORD_HASH_LIMITER,
        ),
        call(
            password_helpers.verify_password_against_dummy,
            "valid-password",
            limiter=password_helpers._PASSWORD_HASH_LIMITER,
        ),
    ]


def test_set_auth_cookies_pins_security_flags():
    """La cookie de sesión es HttpOnly y la de CSRF queda legible por el frontend."""
    response = Response()

    set_auth_cookies(response, session_token="session-token", csrf_token="csrf-token")

    set_cookie_headers = response.headers.getlist("set-cookie")
    session_cookie = next(
        header for header in set_cookie_headers if config.AUTH_SESSION_COOKIE_NAME in header
    )
    csrf_cookie = next(
        header for header in set_cookie_headers if config.AUTH_CSRF_COOKIE_NAME in header
    )
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Path=/" in session_cookie
    assert f"Max-Age={config.AUTH_SESSION_MAX_AGE_SECONDS}" in session_cookie
    assert "HttpOnly" not in csrf_cookie
    assert "SameSite=lax" in csrf_cookie


def test_record_security_event_strips_sensitive_event_data():
    """audit_log nunca persiste claves sensibles aunque se pasen por error."""
    fake_session = FakeSession()

    record_security_event(
        cast(AsyncSession, fake_session),
        event_type="login_failed",
        success=False,
        ip_address="127.0.0.1",
        event_data={
            "target_user_id": "user-1",
            "password": _SENSITIVE,
            "token": _SENSITIVE,
            "cookie": _SENSITIVE,
        },
    )

    audit_log = fake_session.added[0]
    assert isinstance(audit_log, AuditLog)
    assert audit_log.event_data == {"target_user_id": "user-1"}


@pytest.mark.anyio
async def test_login_missing_user_uses_dummy_hash_and_writes_uniform_failure(monkeypatch):
    """El login sin usuario candidato ejecuta hash dummy para reducir timing oracle."""
    fake_session = FakeSession(scalar_result=None)
    dummy_verify = AsyncMock()

    monkeypatch.setattr(service, "verify_password_against_dummy_async", dummy_verify)

    with pytest.raises(InvalidCredentialsError):
        await service.login_user(
            cast(AsyncSession, fake_session),
            identifier="missing@example.com",
            password="valid-password",
            ip_address="127.0.0.1",
        )

    dummy_verify.assert_awaited_once_with("valid-password")
    assert fake_session.commits == 1
    assert [event.event_type for event in fake_session.added] == ["login_failed"]
    assert all(not isinstance(instance, AuthSession) for instance in fake_session.added)


@pytest.mark.anyio
async def test_login_success_creates_hashed_session_and_csrf(monkeypatch):
    """Login correcto persiste sesión con hashes, no tokens crudos."""
    now = datetime(2026, 5, 29, tzinfo=UTC)
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    token_iter = iter(["session-token", "csrf-token"])

    monkeypatch.setattr(service, "utc_now", lambda: now)
    monkeypatch.setattr(service, "generate_opaque_token", lambda: next(token_iter))
    monkeypatch.setattr(
        service,
        "verify_password_async",
        AsyncMock(return_value=(True, None)),
    )

    result = await service.login_user(
        cast(AsyncSession, fake_session),
        identifier="user@example.com",
        password="valid-password",
        ip_address="127.0.0.1",
    )

    auth_session = next(
        instance for instance in fake_session.added if isinstance(instance, AuthSession)
    )
    audit_log = next(instance for instance in fake_session.added if isinstance(instance, AuditLog))
    assert result.session_token == "session-token"
    assert result.csrf_token == "csrf-token"
    assert auth_session.token_hash == hash_token("session-token")
    assert auth_session.csrf_token_hash == hash_token("csrf-token")
    assert auth_session.expires_at == now + timedelta(days=config.AUTH_SESSION_DAYS)
    assert "session-token" not in auth_session.token_hash
    assert "csrf-token" not in auth_session.csrf_token_hash
    assert audit_log.event_type == "login_ok"
    assert fake_session.commits == 1


@pytest.mark.anyio
async def test_authenticate_session_filters_active_user_and_renews_sliding_expiry(monkeypatch):
    """Una sesión válida renueva expires_at a siete días desde la request."""
    now = datetime(2026, 5, 29, tzinfo=UTC)
    auth_session = AuthSession(
        user_id=uuid4(),
        token_hash=hash_token("session-token"),
        csrf_token_hash=hash_token("csrf-token"),
        expires_at=now + timedelta(minutes=10),
    )
    fake_session = FakeSession(row_result=(_user(), auth_session))

    monkeypatch.setattr(service, "utc_now", lambda: now)

    auth = await service.authenticate_session(
        cast(AsyncSession, fake_session),
        session_token="session-token",
        csrf_token="csrf-token",
    )

    assert auth.csrf_token == "csrf-token"
    assert auth.auth_session.expires_at == now + timedelta(days=config.AUTH_SESSION_DAYS)
    assert fake_session.commits == 1
    assert isinstance(fake_session.statements[0], Select)
    compiled = str(fake_session.statements[0])
    assert "users.deleted_at IS NULL" in compiled
    assert "users.status = :status_1" in compiled
    assert "auth_sessions.revoked_at IS NULL" in compiled


def test_to_public_user_never_exposes_sensitive_fields():
    """El contrato público excluye password_hash, username_key y tokens."""
    public_user = service.to_public_user(_user())
    dumped = public_user.model_dump()

    assert "password_hash" not in dumped
    assert "username_key" not in dumped
    assert "token" not in dumped


@pytest.mark.parametrize(
    ("provided_token", "expected"),
    [
        ("csrf-token", True),
        ("wrong-token", False),
        (None, False),
    ],
)
def test_validate_csrf_token_matches_session_hash(
    provided_token: str | None,
    expected: bool,
):
    """CSRF exige header que corresponda al hash persistido en la sesión."""
    auth = service.AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=uuid4(),
            token_hash=hash_token("session-token"),
            csrf_token_hash=hash_token("csrf-token"),
            expires_at=datetime(2026, 5, 29, tzinfo=UTC),
        ),
        session_token="session-token",
        csrf_token="csrf-token",
    )

    assert service.validate_csrf_token(auth, provided_token) is expected


@pytest.mark.anyio
async def test_register_user_hashes_password_forces_user_role_and_audits(monkeypatch):
    """Registro feliz normaliza, hashea, crea sesión y audita register_ok."""
    monkeypatch.setattr(service, "utc_now", lambda: datetime(2026, 5, 29, tzinfo=UTC))
    fake_session = FakeSession()

    result = await service.register_user(
        cast(AsyncSession, fake_session),
        email="USER@Example.com ",
        username="Nora",
        password="valid-password",
        ip_address="127.0.0.1",
    )

    user = result.user
    verification_token = next(
        instance
        for instance in fake_session.added
        if isinstance(instance, EmailVerificationToken)
    )
    auth_session = next(
        instance for instance in fake_session.added if isinstance(instance, AuthSession)
    )
    audit_log = next(i for i in fake_session.added if isinstance(i, AuditLog))
    assert user.email == "user@example.com"
    assert user.username_key == "nora"
    assert user.role == "user"
    assert user.last_login_at == datetime(2026, 5, 29, tzinfo=UTC)
    assert user.password_hash.startswith("$argon2id$")
    assert verification_token.token_hash == hash_token(result.verification_token)
    assert auth_session.token_hash == hash_token(result.session_token)
    assert auth_session.csrf_token_hash == hash_token(result.csrf_token)
    assert result.session_token not in auth_session.token_hash
    assert result.csrf_token not in auth_session.csrf_token_hash
    assert audit_log.event_type == "register_ok"
    assert fake_session.commits == 1


@pytest.mark.anyio
async def test_register_user_awaits_password_hash_wrapper(monkeypatch):
    """El registro usa el wrapper async para no hashear en el event loop."""
    fake_session = FakeSession()
    hash_password_mock = AsyncMock(return_value="argon2-hash")
    monkeypatch.setattr(service, "hash_password_async", hash_password_mock)

    result = await service.register_user(
        cast(AsyncSession, fake_session),
        email="user@example.com",
        username="Nora",
        password="valid-password",
        ip_address=None,
    )

    hash_password_mock.assert_awaited_once_with("valid-password")
    assert result.user.password_hash == "argon2-hash"


@pytest.mark.anyio
async def test_register_user_maps_integrity_error_to_duplicate(monkeypatch):
    """Email/username duplicado se traduce vía IntegrityError, sin check previo."""
    monkeypatch.setattr(service, "utc_now", lambda: datetime(2026, 5, 29, tzinfo=UTC))

    class DuplicateSession(FakeSession):
        def _flush(self):
            raise IntegrityError("INSERT", {}, ValueError("duplicate key"))

    fake_session = DuplicateSession()

    with pytest.raises(service.DuplicateIdentityError):
        await service.register_user(
            cast(AsyncSession, fake_session),
            email="user@example.com",
            username="Nora",
            password="valid-password",
            ip_address=None,
        )

    assert fake_session.rollbacks == 1


@pytest.mark.anyio
async def test_request_email_verification_creates_hashed_token(monkeypatch):
    """Reenvío soft crea token opaco hasheado y consume tokens previos."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    monkeypatch.setattr(service, "utc_now", lambda: now)
    monkeypatch.setattr(service, "generate_opaque_token", lambda: "verify-token")

    email_job = await service.request_email_verification(
        cast(AsyncSession, fake_session),
        email="USER@Example.com",
        ip_address="127.0.0.1",
    )

    verification_token = next(
        instance
        for instance in fake_session.added
        if isinstance(instance, EmailVerificationToken)
    )
    audit_log = next(instance for instance in fake_session.added if isinstance(instance, AuditLog))
    assert email_job == service.AuthEmailJob(
        email="user@example.com",
        username="Nora",
        token="verify-token",
    )
    assert verification_token.token_hash == hash_token("verify-token")
    assert verification_token.expires_at == now + timedelta(
        minutes=config.EMAIL_VERIFICATION_TOKEN_MINUTES
    )
    assert audit_log.event_type == "email_verification_requested"
    assert fake_session.commits == 1
    assert len(fake_session.statements) == 2


@pytest.mark.anyio
async def test_request_email_verification_is_uniform_for_missing_user():
    """Un email inexistente no crea token ni audita datos inventados."""
    fake_session = FakeSession(scalar_result=None)

    email_job = await service.request_email_verification(
        cast(AsyncSession, fake_session),
        email="missing@example.com",
        ip_address="127.0.0.1",
    )

    assert email_job is None
    assert fake_session.added == []
    assert fake_session.commits == 0


@pytest.mark.anyio
async def test_verify_email_token_marks_user_and_consumes_token(monkeypatch):
    """Verificar email consume token y rellena email_verified_at."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    verification_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_token("verify-token"),
        expires_at=now + timedelta(minutes=5),
    )
    fake_session = FakeSession(row_result=(verification_token, user))
    monkeypatch.setattr(service, "utc_now", lambda: now)

    await service.verify_email_token(
        cast(AsyncSession, fake_session),
        token="verify-token",
        ip_address="127.0.0.1",
    )

    audit_log = next(instance for instance in fake_session.added if isinstance(instance, AuditLog))
    assert user.email_verified_at == now
    assert verification_token.consumed_at == now
    assert audit_log.event_type == "email_verified"
    assert fake_session.commits == 1


@pytest.mark.anyio
async def test_verify_email_token_is_idempotent_when_user_already_verified(monkeypatch):
    """Un segundo clic no falla si el usuario ya estaba verificado."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    user.email_verified_at = now - timedelta(minutes=1)
    verification_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_token("verify-token"),
        expires_at=now - timedelta(minutes=1),
        consumed_at=now - timedelta(minutes=1),
    )
    fake_session = FakeSession(row_result=(verification_token, user))
    monkeypatch.setattr(service, "utc_now", lambda: now)

    await service.verify_email_token(
        cast(AsyncSession, fake_session),
        token="verify-token",
        ip_address=None,
    )

    assert fake_session.commits == 0


@pytest.mark.anyio
async def test_verify_email_token_rejects_missing_or_expired(monkeypatch):
    """Tokens ausentes o caducados devuelven error de dominio controlado."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    expired_token = EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_token("verify-token"),
        expires_at=now - timedelta(seconds=1),
    )
    fake_session = FakeSession(row_result=(expired_token, user))
    monkeypatch.setattr(service, "utc_now", lambda: now)

    with pytest.raises(InvalidEmailVerificationTokenError):
        await service.verify_email_token(
            cast(AsyncSession, fake_session),
            token="verify-token",
            ip_address=None,
        )


@pytest.mark.anyio
async def test_request_password_reset_creates_uniform_email_job(monkeypatch):
    """Forgot password crea token hasheado sin exponer si no hay cuenta."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    monkeypatch.setattr(service, "utc_now", lambda: now)
    monkeypatch.setattr(service, "generate_opaque_token", lambda: "reset-token")

    email_job = await service.request_password_reset(
        cast(AsyncSession, fake_session),
        email="user@example.com",
        ip_address="127.0.0.1",
    )

    reset_token = next(
        instance for instance in fake_session.added if isinstance(instance, PasswordResetToken)
    )
    audit_log = next(instance for instance in fake_session.added if isinstance(instance, AuditLog))
    assert email_job == service.AuthEmailJob(
        email="user@example.com",
        username="Nora",
        token="reset-token",
    )
    assert reset_token.token_hash == hash_token("reset-token")
    assert reset_token.expires_at == now + timedelta(minutes=config.PASSWORD_RESET_TOKEN_MINUTES)
    assert audit_log.event_type == "password_reset_requested"
    assert fake_session.commits == 1


@pytest.mark.anyio
async def test_reset_password_with_token_hashes_password_and_revokes_sessions(monkeypatch):
    """Reset válido actualiza contraseña, verifica email soft y revoca sesiones."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token("reset-token"),
        expires_at=now + timedelta(minutes=5),
    )
    fake_session = FakeSession(row_result=(reset_token, user))
    monkeypatch.setattr(service, "utc_now", lambda: now)
    monkeypatch.setattr(service, "hash_password_async", AsyncMock(return_value="new-hash"))

    await service.reset_password_with_token(
        cast(AsyncSession, fake_session),
        token="reset-token",
        password="valid-password",
        ip_address="127.0.0.1",
    )

    audit_log = next(instance for instance in fake_session.added if isinstance(instance, AuditLog))
    assert user.password_hash == "new-hash"
    assert user.password_changed_at == now
    assert user.email_verified_at == now
    assert reset_token.consumed_at == now
    assert audit_log.event_type == "password_reset_ok"
    assert fake_session.commits == 1
    assert "UPDATE auth_sessions" in str(fake_session.statements[-1])


@pytest.mark.anyio
async def test_reset_password_with_token_rejects_consumed_token(monkeypatch):
    """Un token de reset consumido no permite cambiar contraseña."""
    now = datetime(2026, 6, 2, tzinfo=UTC)
    user = _user()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token("reset-token"),
        expires_at=now + timedelta(minutes=5),
        consumed_at=now,
    )
    fake_session = FakeSession(row_result=(reset_token, user))
    monkeypatch.setattr(service, "utc_now", lambda: now)

    with pytest.raises(InvalidPasswordResetTokenError):
        await service.reset_password_with_token(
            cast(AsyncSession, fake_session),
            token="reset-token",
            password="valid-password",
            ip_address=None,
        )


@pytest.mark.anyio
async def test_login_wrong_password_fails_uniformly_with_audit(monkeypatch):
    """Password incorrecta: InvalidCredentials y login_failed con user_id."""
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    monkeypatch.setattr(
        service,
        "verify_password_async",
        AsyncMock(return_value=(False, None)),
    )

    with pytest.raises(InvalidCredentialsError):
        await service.login_user(
            cast(AsyncSession, fake_session),
            identifier="user@example.com",
            password="bad-password",
            ip_address="127.0.0.1",
        )

    audit_log = fake_session.added[0]
    assert audit_log.event_type == "login_failed"
    assert audit_log.user_id == user.id


@pytest.mark.anyio
async def test_login_rehashes_password_when_parameters_change(monkeypatch):
    """Si verify_and_update devuelve hash nuevo, se persiste el actualizado."""
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    monkeypatch.setattr(service, "utc_now", lambda: datetime(2026, 5, 29, tzinfo=UTC))
    monkeypatch.setattr(service, "generate_opaque_token", lambda: "token")
    monkeypatch.setattr(
        service,
        "verify_password_async",
        AsyncMock(return_value=(True, "new-hash")),
    )

    await service.login_user(
        cast(AsyncSession, fake_session),
        identifier="user@example.com",
        password="valid-password",
        ip_address=None,
    )

    assert user.password_hash == "new-hash"


@pytest.mark.anyio
async def test_login_by_username_searches_by_username_key(monkeypatch):
    """Un identifier sin @ se busca por username_key, no por email."""
    user = _user()
    fake_session = FakeSession(scalar_result=user)
    monkeypatch.setattr(service, "utc_now", lambda: datetime(2026, 5, 29, tzinfo=UTC))
    monkeypatch.setattr(service, "generate_opaque_token", lambda: "token")
    monkeypatch.setattr(
        service,
        "verify_password_async",
        AsyncMock(return_value=(True, None)),
    )

    await service.login_user(
        cast(AsyncSession, fake_session),
        identifier="Nora",
        password="valid-password",
        ip_address=None,
    )

    assert "users.username_key" in str(fake_session.statements[0])


@pytest.mark.anyio
async def test_login_with_unparseable_username_fails_uniformly(monkeypatch):
    """Un identifier que no es email ni username válido cae como credenciales malas."""
    fake_session = FakeSession(scalar_result=None)
    dummy = AsyncMock()
    monkeypatch.setattr(service, "verify_password_against_dummy_async", dummy)

    with pytest.raises(InvalidCredentialsError):
        await service.login_user(
            cast(AsyncSession, fake_session),
            identifier="x" * 200,
            password="valid-password",
            ip_address=None,
        )

    dummy.assert_awaited_once_with("valid-password")


@pytest.mark.anyio
async def test_authenticate_session_without_token_requires_auth():
    """Sin token de sesión no se intenta tocar la base de datos."""
    fake_session = FakeSession()

    with pytest.raises(AuthenticationRequiredError):
        await service.authenticate_session(
            cast(AsyncSession, fake_session), session_token=None, csrf_token=None
        )

    assert fake_session.statements == []


@pytest.mark.anyio
async def test_authenticate_session_without_matching_row_requires_auth():
    """Una sesión inexistente, revocada o expirada exige reautenticación."""
    fake_session = FakeSession()
    fake_session.execute = AsyncMock(return_value=FakeRowResult(None))

    with pytest.raises(AuthenticationRequiredError):
        await service.authenticate_session(
            cast(AsyncSession, fake_session), session_token="session-token", csrf_token="csrf-token"
        )


@pytest.mark.anyio
async def test_authenticate_session_rotates_csrf_when_cookie_absent(monkeypatch):
    """Sin cookie CSRF válida, la sesión rota a un token nuevo."""
    now = datetime(2026, 5, 29, tzinfo=UTC)
    auth_session = AuthSession(
        user_id=uuid4(),
        token_hash=hash_token("session-token"),
        csrf_token_hash=hash_token("old-csrf"),
        expires_at=now + timedelta(minutes=10),
    )
    fake_session = FakeSession(row_result=(_user(), auth_session))
    monkeypatch.setattr(service, "utc_now", lambda: now)
    monkeypatch.setattr(service, "generate_opaque_token", lambda: "new-csrf")

    auth = await service.authenticate_session(
        cast(AsyncSession, fake_session), session_token="session-token", csrf_token=None
    )

    assert auth.csrf_token == "new-csrf"
    assert auth_session.csrf_token_hash == hash_token("new-csrf")


@pytest.mark.anyio
async def test_logout_session_revokes_and_audits():
    """Logout marca revoked_at, audita y commitea usando el reloj real."""
    auth_session = AuthSession(
        user_id=uuid4(),
        token_hash=hash_token("session-token"),
        csrf_token_hash=hash_token("csrf-token"),
        expires_at=datetime(2026, 5, 29, tzinfo=UTC),
    )
    auth = service.AuthenticatedSession(
        user=_user(),
        auth_session=auth_session,
        session_token="session-token",
        csrf_token="csrf-token",
    )
    fake_session = FakeSession()

    await service.logout_session(
        cast(AsyncSession, fake_session), auth=auth, ip_address="127.0.0.1"
    )

    assert auth_session.revoked_at is not None
    assert fake_session.added[0].event_type == "logout"
    assert fake_session.commits == 1


@pytest.mark.anyio
async def test_get_current_auth_loads_session_and_sets_cookies(monkeypatch):
    """La dependency resuelve la sesión desde cookies y reescribe las cookies."""
    now = datetime(2026, 5, 29, tzinfo=UTC)
    auth_session = AuthSession(
        user_id=uuid4(),
        token_hash=hash_token("session-token"),
        csrf_token_hash=hash_token("csrf-token"),
        expires_at=now + timedelta(minutes=10),
    )
    fake_session = FakeSession(row_result=(_user(), auth_session))
    monkeypatch.setattr(service, "utc_now", lambda: now)
    request = Request(
        {
            "type": "http",
            "headers": [
                (
                    b"cookie",
                    f"{config.AUTH_SESSION_COOKIE_NAME}=session-token; "
                    f"{config.AUTH_CSRF_COOKIE_NAME}=csrf-token".encode(),
                )
            ],
        }
    )
    response = Response()

    auth = await get_current_auth(request, response, cast(AsyncSession, fake_session))

    assert auth.user.username == "Nora"
    assert "set-cookie" in response.headers


def test_require_csrf_allows_valid_header_and_blocks_mismatch():
    """require_csrf exige que el header CSRF case con el hash de la sesión."""
    auth = service.AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=uuid4(),
            token_hash=hash_token("session-token"),
            csrf_token_hash=hash_token("csrf-token"),
            expires_at=datetime(2026, 5, 29, tzinfo=UTC),
        ),
        session_token="session-token",
        csrf_token="csrf-token",
    )

    require_csrf(auth, "csrf-token")

    with pytest.raises(InvalidCsrfTokenError):
        require_csrf(auth, "wrong-token")


def test_require_admin_allows_admin_and_blocks_normal_user():
    """require_admin lee el rol del usuario cargado desde DB."""
    auth_session = AuthSession(
        user_id=uuid4(),
        token_hash=hash_token("session-token"),
        csrf_token_hash=hash_token("csrf-token"),
        expires_at=datetime(2026, 5, 29, tzinfo=UTC),
    )
    admin_user = _user()
    admin_user.role = "admin"
    admin_auth = service.AuthenticatedSession(
        user=admin_user, auth_session=auth_session, session_token="t", csrf_token="c"
    )
    normal_auth = service.AuthenticatedSession(
        user=_user(), auth_session=auth_session, session_token="t", csrf_token="c"
    )

    assert require_admin(admin_auth) is admin_auth
    with pytest.raises(AdminRequiredError):
        require_admin(normal_auth)


def test_verify_password_accepts_correct_and_rejects_wrong():
    """verify_and_update valida la password correcta y rechaza la incorrecta."""
    password_hash = hash_password("valid-password")

    is_valid, _ = verify_password("valid-password", password_hash)
    is_invalid, _ = verify_password("wrong-password", password_hash)

    assert is_valid is True
    assert is_invalid is False


def test_verify_password_against_dummy_runs_without_user():
    """El verify dummy no lanza; solo consume el coste Argon2 para igualar timing."""
    verify_password_against_dummy("any-password")


def test_client_ip_returns_host_when_request_has_client():
    """Con cliente en el scope, devuelve su IP (la que usan rate limit y auditoria)."""
    request = Request({"type": "http", "client": ("203.0.113.7", 54321)})

    assert client_ip(request) == "203.0.113.7"


def test_client_ip_returns_none_when_request_has_no_client():
    """Sin info de cliente en el scope devuelve None en vez de reventar."""
    request = Request({"type": "http"})

    assert client_ip(request) is None


def _user(password_hash: str = _FAKE_HASH) -> User:
    """Crea un usuario ORM mínimo para tests de auth."""
    return User(
        id=uuid4(),
        email="user@example.com",
        username="Nora",
        username_key="nora",
        password_hash=password_hash,
        role="user",
        status="active",
        created_at=datetime(2026, 5, 29, tzinfo=UTC),
        email_verified_at=None,
        last_login_at=None,
        password_changed_at=datetime(2026, 5, 29, tzinfo=UTC),
    )
