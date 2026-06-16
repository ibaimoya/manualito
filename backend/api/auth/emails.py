"""Correos transaccionales de autenticación."""

import logging
from urllib.parse import urlencode

import aiosmtplib

from api import config
from api.mail.client import send_email
from api.worker.tasks.mail import enqueue_email

logger = logging.getLogger(__name__)


def schedule_verification_email(
    *,
    to_email: str,
    username: str,
    token: str,
) -> None:
    """Encola el email de verificación sin bloquear la respuesta HTTP."""
    enqueue_email(
        to_email=to_email,
        subject="Verifica tu email en Manualito",
        text_body=_verification_email_body(username=username, token=token),
    )


def schedule_password_reset_email(
    *,
    to_email: str,
    username: str,
    token: str,
) -> None:
    """Encola el email de reset ocultando su contenido en eventos Celery."""
    enqueue_email(
        to_email=to_email,
        subject="Restablece tu contraseña en Manualito",
        text_body=_password_reset_email_body(username=username, token=token),
    )


async def send_email_safely(*, to_email: str, subject: str, text_body: str) -> None:
    """Envía email best-effort y registra fallos sin tokens ni URLs."""
    try:
        await send_email(to_email=to_email, subject=subject, text_body=text_body)
    except (aiosmtplib.SMTPException, OSError):
        logger.warning("No se pudo enviar un email transaccional de auth.", exc_info=True)


def _verification_email_body(*, username: str, token: str) -> str:
    """Construye el texto del email de verificación."""
    link = _frontend_link("/verify-email", token)
    return (
        f"Hola {username},\n\n"
        "Puedes verificar tu email de Manualito con este enlace:\n"
        f"{link}\n\n"
        "Si no has creado esta cuenta, puedes ignorar este correo."
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


def _frontend_link(path: str, token: str) -> str:
    """Genera un enlace de frontend sin loguearlo."""
    base_url = config.FRONTEND_PUBLIC_URL.rstrip("/")
    return f"{base_url}{path}?{urlencode({'token': token})}"
