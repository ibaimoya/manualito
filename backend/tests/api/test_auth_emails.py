from unittest.mock import Mock

import pytest

from api.auth import emails


def test_schedule_verification_email_enqueues_text_and_html(monkeypatch):
    """El email de verificación se encola con texto plano y HTML on-brand."""
    enqueue_mock = Mock()
    monkeypatch.setattr(emails, "enqueue_email", enqueue_mock)
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")
    monkeypatch.setattr(emails.config, "EMAIL_VERIFICATION_TOKEN_MINUTES", 60)

    emails.schedule_verification_email(
        to_email="user@example.com",
        username="Nora",
        token="token con espacios",
    )

    enqueue_mock.assert_called_once()
    kwargs = enqueue_mock.call_args.kwargs
    assert kwargs["to_email"] == "user@example.com"
    assert kwargs["subject"] == "Tu turno, Nora — confirma tu email"
    assert "Hola Nora" in kwargs["text_body"]
    assert "http://frontend.local/verify-email?token=token+con+espacios" in kwargs["text_body"]
    assert "Si no has creado esta cuenta, ignora este correo sin problema." in kwargs["text_body"]
    assert "Verificar mi email" in kwargs["html_body"]
    assert "El enlace caduca en 1 hora." in kwargs["html_body"]


def test_schedule_password_reset_email_enqueues_text_and_html(monkeypatch):
    """El email de restablecimiento se encola con texto plano y HTML on-brand."""
    enqueue_mock = Mock()
    monkeypatch.setattr(emails, "enqueue_email", enqueue_mock)
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")
    monkeypatch.setattr(emails.config, "PASSWORD_RESET_TOKEN_MINUTES", 30)

    emails.schedule_password_reset_email(
        to_email="user@example.com",
        username="Nora",
        token="token con espacios",
    )

    enqueue_mock.assert_called_once()
    kwargs = enqueue_mock.call_args.kwargs
    assert kwargs["to_email"] == "user@example.com"
    assert kwargs["subject"] == "Restablece tu contraseña en Manualito"
    assert kwargs["text_body"] == (
        "Hola Nora,\n\n"
        "Puedes restablecer tu contraseña de Manualito con este enlace:\n"
        "http://frontend.local/reset-password?token=token+con+espacios\n\n"
        "Si no has pedido este cambio, puedes ignorar este correo."
    )
    assert "http://frontend.local/reset-password?token=token+con+espacios" in kwargs["html_body"]
    assert "Restablecer contraseña" in kwargs["html_body"]
    assert "El enlace caduca en 30 minutos." in kwargs["html_body"]


def test_auth_email_links_use_frontend_public_url(monkeypatch):
    """Los enlaces apuntan al frontend y transportan el token por query param."""
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")

    body = emails._password_reset_email_body(username="Nora", token="token con espacios")

    assert "http://frontend.local/reset-password?token=token+con+espacios" in body


def test_verification_email_html_escapes_username_and_uses_template_values(monkeypatch):
    """El HTML escapa usuario, usa CID, enlace codificado, CTA y caducidad."""
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")
    monkeypatch.setattr(emails.config, "EMAIL_VERIFICATION_TOKEN_MINUTES", 1440)

    html_body = emails._verification_email_html(
        username="Nora <Admin>",
        token="token con espacios/ñ",
    )

    assert "Nora &lt;Admin&gt;" in html_body
    assert "Nora <Admin>" not in html_body
    assert "cid:manualito-logo" in html_body
    assert (
        "http://frontend.local/verify-email?token=token+con+espacios%2F%C3%B1"
        in html_body
    )
    assert "Verificar mi email" in html_body
    assert "El enlace caduca en 24 horas." in html_body
    assert "Si no has creado esta cuenta, ignora este correo sin problema." in html_body


def test_password_reset_email_html_escapes_username_and_uses_template_values(monkeypatch):
    """El HTML de reset escapa usuario, usa CID, enlace codificado, CTA y caducidad."""
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")
    monkeypatch.setattr(emails.config, "PASSWORD_RESET_TOKEN_MINUTES", 30)

    html_body = emails._password_reset_email_html(
        username="Nora <Admin>",
        token="token con espacios/ñ",
    )

    assert "Nora &lt;Admin&gt;" in html_body
    assert "Nora <Admin>" not in html_body
    assert "cid:manualito-logo" in html_body
    assert (
        "http://frontend.local/reset-password?token=token+con+espacios%2F%C3%B1"
        in html_body
    )
    assert "Restablecer contraseña" in html_body
    assert "El enlace caduca en 30 minutos." in html_body
    assert "Si no has pedido este cambio, ignora este correo sin problema." in html_body


@pytest.mark.parametrize(
    ("minutes", "label"),
    [
        (1440, "24 horas"),
        (60, "1 hora"),
        (30, "30 minutos"),
        (1, "1 minuto"),
    ],
)
def test_humanize_minutes_covers_all_labels(minutes, label):
    """La etiqueta de caducidad distingue singular, plural, horas y minutos."""
    assert emails._humanize_minutes(minutes) == label
