"""Casos de uso de autenticación y sesiones."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.auth.audit import record_security_event
from api.auth.exceptions import (
    AuthenticationRequiredError,
    DuplicateIdentityError,
    InvalidCredentialsError,
)
from api.auth.passwords import (
    hash_password_async,
    validate_password_policy,
    verify_password_against_dummy_async,
    verify_password_async,
)
from api.auth.schemas import UserPublic
from api.auth.tokens import generate_opaque_token, hash_token, token_matches
from api.auth.username import (
    UsernameValidationError,
    build_username_key,
    normalize_username,
)
from database.models.auth import AuthSession
from database.models.user import User

ACTIVE_USER_STATUS = "active"


@dataclass(slots=True)
class LoginResult:
    """Usuario autenticado junto con tokens crudos entregables al cliente."""

    user: User
    session_token: str
    csrf_token: str


@dataclass(slots=True)
class AuthenticatedSession:
    """Sesión validada para una request autenticada."""

    user: User
    auth_session: AuthSession
    session_token: str
    csrf_token: str


async def register_user(
    session: AsyncSession,
    *,
    email: str,
    username: str,
    password: str,
    ip_address: str | None,
) -> User:
    """Crea un usuario normal apoyándose en constraints únicos de Postgres."""
    normalized_email = normalize_email(email)
    normalized_username = normalize_username(username)
    username_key = build_username_key(normalized_username)
    validate_password_policy(password)

    password_hash = await hash_password_async(password)
    now = utc_now()
    user = User(
        email=normalized_email,
        username=normalized_username,
        username_key=username_key,
        password_hash=password_hash,
        password_changed_at=now,
        role="user",
        status=ACTIVE_USER_STATUS,
    )
    session.add(user)

    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateIdentityError from exc

    record_security_event(
        session,
        event_type="register_ok",
        success=True,
        ip_address=ip_address,
        user_id=user.id,
    )
    await session.commit()
    await session.refresh(user)
    return user


async def login_user(
    session: AsyncSession,
    *,
    identifier: str,
    password: str,
    ip_address: str | None,
) -> LoginResult:
    """Verifica credenciales y crea una sesión opaca persistida."""
    user = await _find_active_user_by_identifier(session, identifier)
    if user is None:
        await verify_password_against_dummy_async(password)
        await _record_failed_login(session, ip_address=ip_address)
        raise InvalidCredentialsError

    is_valid, updated_hash = await verify_password_async(password, user.password_hash)
    if not is_valid:
        await _record_failed_login(session, ip_address=ip_address, user=user)
        raise InvalidCredentialsError

    now = utc_now()
    if updated_hash is not None:
        user.password_hash = updated_hash
    user.last_login_at = now

    session_token = generate_opaque_token()
    csrf_token = generate_opaque_token()
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(session_token),
        csrf_token_hash=hash_token(csrf_token),
        created_at=now,
        last_seen_at=now,
        expires_at=build_session_expiry(now),
    )
    session.add(auth_session)
    record_security_event(
        session,
        event_type="login_ok",
        success=True,
        ip_address=ip_address,
        user_id=user.id,
    )
    await session.commit()
    await session.refresh(user)
    return LoginResult(user=user, session_token=session_token, csrf_token=csrf_token)


async def authenticate_session(
    session: AsyncSession,
    *,
    session_token: str | None,
    csrf_token: str | None,
) -> AuthenticatedSession:
    """Carga usuario y sesión activos a partir de la cookie opaca."""
    if not session_token:
        raise AuthenticationRequiredError

    result = await session.execute(
        select(User, AuthSession)
        .join(AuthSession, AuthSession.user_id == User.id)
        .where(
            AuthSession.token_hash == hash_token(session_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > utc_now(),
            User.deleted_at.is_(None),
            User.status == ACTIVE_USER_STATUS,
        )
    )
    row = result.one_or_none()
    if row is None:
        raise AuthenticationRequiredError

    user, auth_session = row
    current_csrf_token = _ensure_csrf_token(auth_session, csrf_token)
    now = utc_now()
    auth_session.last_seen_at = now
    auth_session.expires_at = build_session_expiry(now)
    await session.commit()
    return AuthenticatedSession(
        user=user,
        auth_session=auth_session,
        session_token=session_token,
        csrf_token=current_csrf_token,
    )


async def logout_session(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    ip_address: str | None,
) -> None:
    """Revoca la sesión actual y registra el cierre."""
    auth.auth_session.revoked_at = utc_now()
    record_security_event(
        session,
        event_type="logout",
        success=True,
        ip_address=ip_address,
        user_id=auth.user.id,
    )
    await session.commit()


def validate_csrf_token(auth: AuthenticatedSession, csrf_token: str | None) -> bool:
    """Comprueba el header CSRF contra el hash guardado en la sesión."""
    if not csrf_token or auth.auth_session.csrf_token_hash is None:
        return False
    return token_matches(csrf_token, auth.auth_session.csrf_token_hash)


def normalize_email(email: str) -> str:
    """Normaliza email para búsquedas e índices case-insensitive."""
    return email.strip().lower()


def build_session_expiry(now: datetime | None = None) -> datetime:
    """Calcula la expiración deslizante de sesión."""
    base = now or utc_now()
    return base + timedelta(days=config.AUTH_SESSION_DAYS)


def to_public_user(user: User) -> UserPublic:
    """Convierte el ORM interno en contrato público seguro."""
    return UserPublic(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


def utc_now() -> datetime:
    """Devuelve un datetime aware para comparar expiraciones."""
    return datetime.now(UTC)


async def _find_active_user_by_identifier(
    session: AsyncSession,
    identifier: str,
) -> User | None:
    """Busca por email o username excluyendo usuarios borrados o inactivos."""
    normalized_identifier = identifier.strip()
    if "@" in normalized_identifier:
        clause = User.email == normalize_email(normalized_identifier)
    else:
        try:
            username_key = build_username_key(normalized_identifier)
        except UsernameValidationError:
            return None
        clause = User.username_key == username_key

    result = await session.execute(
        select(User).where(
            clause,
            User.deleted_at.is_(None),
            User.status == ACTIVE_USER_STATUS,
        )
    )
    return result.scalar_one_or_none()


async def _record_failed_login(
    session: AsyncSession,
    *,
    ip_address: str | None,
    user: User | None = None,
) -> None:
    """Registra fallo de login sin revelar si el identificador existe."""
    record_security_event(
        session,
        event_type="login_failed",
        success=False,
        ip_address=ip_address,
        user_id=user.id if user else None,
    )
    await session.commit()


def _ensure_csrf_token(auth_session: AuthSession, csrf_token: str | None) -> str:
    """Reutiliza el token CSRF si encaja o rota uno nuevo para la sesión."""
    if (
        csrf_token
        and auth_session.csrf_token_hash
        and token_matches(csrf_token, auth_session.csrf_token_hash)
    ):
        return csrf_token

    new_csrf_token = generate_opaque_token()
    auth_session.csrf_token_hash = hash_token(new_csrf_token)
    return new_csrf_token
