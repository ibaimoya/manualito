"""Correos transaccionales de autenticación."""

import logging
from html import escape
from pathlib import Path
from string import Template
from urllib.parse import urlencode

from api import config
from api.worker.tasks.mail import enqueue_email

logger = logging.getLogger(__name__)
_VERIFICATION_TEMPLATE = Template(
    (
        Path(__file__).parents[1] / "mail" / "templates" / "verification_email.html"
    ).read_text(encoding="utf-8")
)
_RESET_TEMPLATE = Template(
    (
        Path(__file__).parents[1] / "mail" / "templates" / "reset_password_email.html"
    ).read_text(encoding="utf-8")
)


def schedule_verification_email(
    *,
    to_email: str,
    username: str,
    token: str,
) -> None:
    """Encola el email de verificación (texto + HTML) sin bloquear la respuesta."""
    enqueue_email(
        to_email=to_email,
        subject=f"Tu turno, {username} — confirma tu email",
        text_body=_verification_email_body(username=username, token=token),
        html_body=_verification_email_html(username=username, token=token),
    )


def schedule_password_reset_email(
    *,
    to_email: str,
    username: str,
    token: str,
) -> None:
    """Encola el email de reset (texto + HTML) ocultando su contenido en Celery."""
    enqueue_email(
        to_email=to_email,
        subject="Restablece tu contraseña en Manualito",
        text_body=_password_reset_email_body(username=username, token=token),
        html_body=_password_reset_email_html(username=username, token=token),
    )


def _verification_email_body(*, username: str, token: str) -> str:
    """Construye el texto del email de verificación."""
    link = _frontend_link("/verify-email", token)
    return (
        f"Hola {username},\n\n"
        "Puedes verificar tu email de Manualito con este enlace:\n"
        f"{link}\n\n"
        "Si no has creado esta cuenta, ignora este correo sin problema."
    )


def _verification_email_html(*, username: str, token: str) -> str:
    """Construye el cuerpo HTML del email de verificación."""
    return _VERIFICATION_TEMPLATE.substitute(
        username=escape(username),
        verify_url=_frontend_link("/verify-email", token),
        expiry_label=_humanize_minutes(config.EMAIL_VERIFICATION_TOKEN_MINUTES),
    )


def _password_reset_email_body(*, username: str, token: str) -> str:
    """Construye el texto del email de restablecimiento."""
    link = _frontend_link("/reset-password", token)
    return (
        f"Hola {username},\n\n"
        "Puedes restablecer tu contraseña de Manualito con este enlace:\n"
        f"{link}\n\n"
        "Si no has pedido este cambio, puedes ignorar este correo."
    )


def _password_reset_email_html(*, username: str, token: str) -> str:
    """Construye el cuerpo HTML del email de restablecimiento."""
    return _RESET_TEMPLATE.substitute(
        username=escape(username),
        reset_url=_frontend_link("/reset-password", token),
        expiry_label=_humanize_minutes(config.PASSWORD_RESET_TOKEN_MINUTES),
    )


def _frontend_link(path: str, token: str) -> str:
    """Genera un enlace de frontend sin loguearlo."""
    base_url = config.FRONTEND_PUBLIC_URL.rstrip("/")
    return f"{base_url}{path}?{urlencode({'token': token})}"


def _humanize_minutes(minutes: int) -> str:
    """Devuelve una etiqueta de caducidad legible a partir de minutos."""
    if minutes % 60 == 0:
        hours = minutes // 60
        return "1 hora" if hours == 1 else f"{hours} horas"
    return "1 minuto" if minutes == 1 else f"{minutes} minutos"
