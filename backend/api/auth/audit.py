"""Registro mínimo de eventos sensibles de seguridad."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from database.models.audit import AuditLog

SENSITIVE_EVENT_KEYS = frozenset(
    {
        "authorization",
        "cookie",
        "csrf_token",
        "password",
        "password_hash",
        "session_token",
        "token",
    }
)


def record_security_event(
    session: AsyncSession,
    *,
    event_type: str,
    success: bool,
    ip_address: str | None,
    user_id: UUID | None = None,
    event_data: dict[str, object] | None = None,
) -> None:
    """Añade un evento de auditoría sin payloads ni secretos."""
    safe_event_data = _strip_sensitive_event_data(event_data or {})
    session.add(
        AuditLog(
            user_id=user_id,
            event_type=event_type,
            success=success,
            ip_address=ip_address,
            event_data=safe_event_data,
        )
    )


def _strip_sensitive_event_data(event_data: dict[str, object]) -> dict[str, object]:
    """Descarta claves de datos sensibles antes de persistir el evento."""
    return {
        key: value
        for key, value in event_data.items()
        if key.lower() not in SENSITIVE_EVENT_KEYS
    }

