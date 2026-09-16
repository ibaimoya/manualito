from html import unescape
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import pytest
from pydantic import ValidationError

from api.auth import emails
from api.auth.schemas import (
    ForgotPasswordRequest,
    RegisterRequest,
    ResendVerificationEmailRequest,
)


@pytest.mark.parametrize("locale", ["es", "en"])
@pytest.mark.parametrize("kind", ["verification", "reset"])
def test_auth_email_uses_selected_language_and_consistent_bodies(monkeypatch, locale, kind):
    """La cola externa se intercepta para comprobar el correo sin enviarlo."""
    enqueue = Mock()
    monkeypatch.setattr(emails, "enqueue_email", enqueue)
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "https://app.example.com/")
    monkeypatch.setattr(emails.config, "EMAIL_VERIFICATION_TOKEN_MINUTES", 60)
    monkeypatch.setattr(emails.config, "PASSWORD_RESET_TOKEN_MINUTES", 30)
    schedule = (
        emails.schedule_verification_email
        if kind == "verification"
        else emails.schedule_password_reset_email
    )

    schedule(
        to_email="user@example.com",
        username="Nora <Admin> & friends",
        token="token con espacios/ñ&x=1",
        locale=locale,
    )

    enqueue.assert_called_once()
    message = enqueue.call_args.kwargs
    html_body = message["html_body"]
    text_body = message["text_body"]
    assert message["to_email"] == "user@example.com"
    assert (
        message["subject"]
        == {
            ("verification", "es"): "Verifica tu email en Manualito",
            ("verification", "en"): "Verify your email for Manualito",
            ("reset", "es"): "Restablece tu contraseña en Manualito",
            ("reset", "en"): "Reset your Manualito password",
        }[kind, locale]
    )
    assert f'lang="{locale}"' in html_body
    assert "Nora &lt;Admin&gt; &amp; friends" in html_body
    assert "Nora <Admin> & friends" in text_body
    assert "Nora <Admin>" not in html_body
    assert "cid:manualito-logo" in html_body
    assert "$" not in html_body
    greeting = "Hola, Nora" if locale == "es" else "Hi Nora"
    expiry = {
        ("verification", "es"): "1 hora",
        ("verification", "en"): "1 hour",
        ("reset", "es"): "30 minutos",
        ("reset", "en"): "30 minutes",
    }[kind, locale]
    ignore = "Si no" if locale == "es" else "If you didn't"
    for body in (unescape(html_body), text_body):
        assert greeting in body
        assert expiry in body
        assert ignore in body
    link = next(line for line in text_body.splitlines() if line.startswith("https://"))
    parsed = urlsplit(link)
    expected_path = "/verify-email" if kind == "verification" else "/reset-password"
    assert parsed.netloc == "app.example.com"
    assert parsed.path == expected_path
    assert parse_qs(parsed.query) == {"token": ["token con espacios/ñ&x=1"]}
    assert link in unescape(html_body)


@pytest.mark.parametrize(
    ("minutes", "locale", "label"),
    [
        (1440, "es", "24 horas"),
        (60, "es", "1 hora"),
        (30, "es", "30 minutos"),
        (1, "es", "1 minuto"),
        (1440, "en", "24 hours"),
        (60, "en", "1 hour"),
        (30, "en", "30 minutes"),
        (1, "en", "1 minute"),
    ],
)
def test_expiry_label_uses_selected_language(minutes, locale, label):
    assert emails._humanize_minutes(minutes, locale) == label


@pytest.mark.parametrize(
    "schema", [RegisterRequest, ForgotPasswordRequest, ResendVerificationEmailRequest]
)
@pytest.mark.parametrize("locale", ["es", "en"])
def test_email_requests_accept_supported_locales(schema, locale):
    payload = {"email": "nora@example.com", "locale": locale}
    if schema is RegisterRequest:
        payload.update(username="Nora", password="a-password-long-enough")
    assert schema.model_validate(payload).locale == locale


@pytest.mark.parametrize(
    "schema", [RegisterRequest, ForgotPasswordRequest, ResendVerificationEmailRequest]
)
@pytest.mark.parametrize("locale", [None, "fr", "en-US", 1])
def test_email_requests_require_an_explicit_supported_locale(schema, locale):
    payload = {"email": "nora@example.com"}
    if locale is not None:
        payload["locale"] = locale
    if schema is RegisterRequest:
        payload.update(username="Nora", password="a-password-long-enough")
    with pytest.raises(ValidationError) as error:
        schema.model_validate(payload)
    assert error.value.errors()[0]["loc"] == ("locale",)
