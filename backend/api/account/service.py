"""Casos de uso de cuenta y perfil."""

import logging
from dataclasses import dataclass

import httpx
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.account import repository
from api.account.schemas import MeStatsResponse
from api.assets.storage import delete_stored_file
from api.auth.audit import record_security_event
from api.auth.exceptions import (
    AuthFieldError,
    AuthFormValidationError,
    DuplicateIdentityError,
    InvalidCredentialsError,
)
from api.auth.passwords import (
    hash_password_async,
    validate_password_policy,
    verify_password_async,
)
from api.auth.service import (
    AuthEmailJob,
    AuthenticatedSession,
    normalize_email,
    rotate_email_verification_token,
    utc_now,
)
from api.auth.username import UsernameValidationError, build_username_key, normalize_username
from api.manuals.service import delete_chunks_from_rag
from database.models.auth import AuthSession
from database.models.user import User

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ProfileUpdateResult:
    """Usuario actualizado junto al email de verificación pendiente."""

    user: User
    email_job: AuthEmailJob | None


async def get_account_stats(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
) -> MeStatsResponse:
    """Devuelve la actividad agregada del usuario autenticado."""
    stats = await repository.get_user_activity_stats(session, user_id=auth.user.id)
    return MeStatsResponse.model_validate(stats)


async def update_profile(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    username: str | None,
    email: str | None,
    avatar_color: str | None,
    avatar_figure: str | None,
    ip_address: str | None,
) -> ProfileUpdateResult:
    """Aplica cambios de identidad reusando las reglas de registro."""
    user = auth.user
    now = utc_now()
    changed_fields: list[str] = []

    if username is not None:
        normalized_username = normalize_username(username)
        if normalized_username != user.username:
            user.username = normalized_username
            user.username_key = build_username_key(normalized_username)
            changed_fields.append("username")

    email_job = None
    if email is not None:
        normalized_email = normalize_email(email)
        if normalized_email != user.email:
            user.email = normalized_email
            user.email_verified_at = None
            token = await rotate_email_verification_token(session, user=user, now=now)
            email_job = AuthEmailJob(
                email=normalized_email,
                username=user.username,
                token=token,
            )
            changed_fields.append("email")

    if avatar_color is not None and avatar_color != user.avatar_color:
        user.avatar_color = avatar_color
        changed_fields.append("avatar_color")
    if avatar_figure is not None and avatar_figure != user.avatar_figure:
        user.avatar_figure = avatar_figure
        changed_fields.append("avatar_figure")

    if not changed_fields:
        await session.rollback()
        return ProfileUpdateResult(user=user, email_job=None)

    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise DuplicateIdentityError from exc
    record_security_event(
        session,
        event_type="profile_updated",
        success=True,
        ip_address=ip_address,
        user_id=user.id,
        event_data={"fields": changed_fields},
    )
    await session.commit()
    await session.refresh(user)
    return ProfileUpdateResult(user=user, email_job=email_job)


async def delete_account(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    username_confirmation: str,
    client: httpx.AsyncClient,
    ip_address: str | None,
) -> None:
    """Borra la cuenta y todo su contenido tras confirmar el propio usuario."""
    _ensure_username_confirmation(auth.user, username_confirmation)
    now = utc_now()
    cleanup = await repository.purge_user_account(session, user_id=auth.user.id, now=now)
    record_security_event(
        session,
        event_type="account_deleted",
        success=True,
        ip_address=ip_address,
        user_id=auth.user.id,
    )
    await session.commit()

    # Postgres ya es consistente; disco y Chroma son derivados reconstruibles.
    for storage_key in cleanup.storage_keys:
        if not await delete_stored_file(storage_key):
            logger.warning("No se pudo borrar un fichero físico al eliminar una cuenta.")
    for manual_id, chunk_ids in cleanup.chunk_ids_by_manual.items():
        await delete_chunks_from_rag(
            client=client,
            manual_id=manual_id,
            chunk_ids=chunk_ids,
        )


def _ensure_username_confirmation(user: User, username_confirmation: str) -> None:
    """Exige que la confirmación coincida con el usuario de la cuenta."""
    try:
        confirmation_key = build_username_key(username_confirmation)
    except UsernameValidationError:
        confirmation_key = None
    if confirmation_key != user.username_key:
        raise AuthFormValidationError(
            AuthFieldError(
                field="username",
                code="username_confirmation_mismatch",
                message="El nombre de usuario no coincide con tu cuenta.",
            )
        )


async def change_password(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    current_password: str,
    new_password: str,
    ip_address: str | None,
) -> None:
    """Cambia la contraseña y revoca el resto de sesiones activas."""
    validate_password_policy(new_password)
    user = auth.user
    is_valid, _updated_hash = await verify_password_async(
        current_password,
        user.password_hash,
    )
    if not is_valid:
        record_security_event(
            session,
            event_type="password_change_failed",
            success=False,
            ip_address=ip_address,
            user_id=user.id,
        )
        await session.commit()
        raise InvalidCredentialsError

    now = utc_now()
    user.password_hash = await hash_password_async(new_password)
    user.password_changed_at = now
    await session.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.id != auth.auth_session.id,
        )
        .values(revoked_at=now)
    )
    record_security_event(
        session,
        event_type="password_changed",
        success=True,
        ip_address=ip_address,
        user_id=user.id,
    )
    await session.commit()
