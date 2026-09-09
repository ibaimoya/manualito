"""Verificación y recuperación de cuenta en español e inglés."""

from html import escape
from pathlib import Path
from string import Template
from typing import Literal, TypedDict
from urllib.parse import urlencode

from api import config
from api.auth.schemas import EmailLocale
from api.worker.tasks.mail import enqueue_email

type EmailKind = Literal["verification", "reset"]


class EmailContent(TypedDict):
    """Contenido de un correo en HTML y texto plano."""

    title: str
    heading: str
    preheader: str
    greeting: str
    intro: str
    action_label: str
    expiry_note: str
    ignore_note: str
    fallback_note: str


_AUTH_TEMPLATE = Template(
    (Path(__file__).parents[1] / "mail" / "templates" / "auth_email.html").read_text(
        encoding="utf-8"
    )
)
_CONTENT: dict[tuple[EmailKind, EmailLocale], EmailContent] = {
    ("verification", "es"): {
        "title": "Verifica tu email en Manualito",
        "heading": "Verifica tu email",
        "preheader": "Confirma que esta dirección de email es tuya.",
        "greeting": "Hola, {username}.",
        "intro": "Verifica esta dirección de email para tu cuenta de Manualito.",
        "action_label": "Verificar email",
        "expiry_note": "El enlace caduca en {expiry}.",
        "ignore_note": "Si no has creado esta cuenta, ignora este correo.",
        "fallback_note": "Si el botón no funciona, copia este enlace.",
    },
    ("verification", "en"): {
        "title": "Verify your email for Manualito",
        "heading": "Verify your email",
        "preheader": "Confirm that this email address belongs to you.",
        "greeting": "Hi {username},",
        "intro": "Verify this email address for your Manualito account.",
        "action_label": "Verify email",
        "expiry_note": "This link expires in {expiry}.",
        "ignore_note": "If you didn't create this account, ignore this email.",
        "fallback_note": "If the button doesn't work, copy this link.",
    },
    ("reset", "es"): {
        "title": "Restablece tu contraseña en Manualito",
        "heading": "Restablece tu contraseña",
        "preheader": "Usa este enlace para elegir una contraseña nueva.",
        "greeting": "Hola, {username}.",
        "intro": "Puedes elegir una contraseña nueva para tu cuenta de Manualito.",
        "action_label": "Restablecer contraseña",
        "expiry_note": "El enlace caduca en {expiry}.",
        "ignore_note": ("Si no lo has solicitado, ignora este correo. Tu contraseña no cambiará."),
        "fallback_note": "Si el botón no funciona, copia este enlace.",
    },
    ("reset", "en"): {
        "title": "Reset your Manualito password",
        "heading": "Reset your password",
        "preheader": "Use this link to choose a new password.",
        "greeting": "Hi {username},",
        "intro": "You can choose a new password for your Manualito account.",
        "action_label": "Reset password",
        "expiry_note": "This link expires in {expiry}.",
        "ignore_note": (
            "If you didn't request this, ignore this email. Your password won't change."
        ),
        "fallback_note": "If the button doesn't work, copy this link.",
    },
}


def schedule_verification_email(
    *, to_email: str, username: str, token: str, locale: EmailLocale
) -> None:
    """Programa el correo para verificar la cuenta."""
    enqueue_email(
        to_email=to_email,
        **_build_email(kind="verification", username=username, token=token, locale=locale),
    )


def schedule_password_reset_email(
    *, to_email: str, username: str, token: str, locale: EmailLocale
) -> None:
    """Programa el correo para recuperar la cuenta."""
    enqueue_email(
        to_email=to_email,
        **_build_email(kind="reset", username=username, token=token, locale=locale),
    )


def _build_email(
    *, kind: EmailKind, username: str, token: str, locale: EmailLocale
) -> dict[str, str]:
    content = _CONTENT[kind, locale]
    path = "/verify-email" if kind == "verification" else "/reset-password"
    minutes = (
        config.EMAIL_VERIFICATION_TOKEN_MINUTES
        if kind == "verification"
        else config.PASSWORD_RESET_TOKEN_MINUTES
    )
    base_url = config.FRONTEND_PUBLIC_URL.rstrip("/")
    link = f"{base_url}{path}?{urlencode({'token': token})}"
    greeting = content["greeting"].format(username=username)
    expiry_note = content["expiry_note"].format(expiry=_humanize_minutes(minutes, locale))
    text_body = "\n\n".join((greeting, content["intro"], link, expiry_note, content["ignore_note"]))
    return {
        "subject": content["title"],
        "text_body": text_body,
        "html_body": _AUTH_TEMPLATE.substitute(
            locale=locale,
            title=escape(content["title"]),
            heading=escape(content["heading"]),
            preheader=escape(content["preheader"]),
            greeting=escape(greeting),
            intro=escape(content["intro"]),
            action_label=escape(content["action_label"]),
            action_url=escape(link),
            expiry_note=escape(expiry_note),
            ignore_note=escape(content["ignore_note"]),
            fallback_note=escape(content["fallback_note"]),
        ),
    }


def _humanize_minutes(minutes: int, locale: EmailLocale) -> str:
    if minutes % 60 == 0:
        hours = minutes // 60
        if locale == "en":
            return "1 hour" if hours == 1 else f"{hours} hours"
        return "1 hora" if hours == 1 else f"{hours} horas"
    if locale == "en":
        return "1 minute" if minutes == 1 else f"{minutes} minutes"
    return "1 minuto" if minutes == 1 else f"{minutes} minutos"
