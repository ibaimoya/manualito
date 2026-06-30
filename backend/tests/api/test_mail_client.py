from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from api.mail import client as mail_client


@pytest.mark.anyio
async def test_send_email_uses_configured_smtp(monkeypatch):
    """El cliente SMTP construye EmailMessage y usa la configuración de API."""
    send_mock = AsyncMock()
    monkeypatch.setattr(mail_client.aiosmtplib, "send", send_mock)
    monkeypatch.setattr(mail_client.config, "SMTP_HOST", "mailpit")
    monkeypatch.setattr(mail_client.config, "SMTP_PORT", 1025)
    monkeypatch.setattr(mail_client.config, "SMTP_STARTTLS", False)
    monkeypatch.setattr(mail_client.config, "SMTP_USE_TLS", False)
    monkeypatch.setattr(mail_client.config, "SMTP_TIMEOUT", 10.0)
    monkeypatch.setattr(mail_client.config, "SMTP_USERNAME", None)
    monkeypatch.setattr(mail_client.config, "SMTP_PASSWORD", None)
    monkeypatch.setattr(mail_client.config, "SMTP_FROM_EMAIL", "no-reply@manualito.local")

    await mail_client.send_email(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Contenido",
    )

    message = send_mock.await_args.args[0]
    assert message["From"] == "no-reply@manualito.local"
    assert message["To"] == "user@example.com"
    assert message["Subject"] == "Asunto"
    assert message.get_content_type() == "text/plain"
    assert not message.is_multipart()
    assert send_mock.await_args.kwargs == {
        "hostname": "mailpit",
        "port": 1025,
        "start_tls": False,
        "use_tls": False,
        "timeout": 10.0,
        "username": None,
        "password": None,
    }


@pytest.mark.anyio
async def test_send_email_adds_html_alternative_with_inline_logo(monkeypatch):
    """El cliente SMTP envía texto, HTML e imagen embebida por Content-ID."""
    send_mock = AsyncMock()
    monkeypatch.setattr(mail_client.aiosmtplib, "send", send_mock)
    monkeypatch.setattr(mail_client.config, "SMTP_HOST", "mailpit")
    monkeypatch.setattr(mail_client.config, "SMTP_PORT", 1025)
    monkeypatch.setattr(mail_client.config, "SMTP_STARTTLS", False)
    monkeypatch.setattr(mail_client.config, "SMTP_USE_TLS", False)
    monkeypatch.setattr(mail_client.config, "SMTP_TIMEOUT", 10.0)
    monkeypatch.setattr(mail_client.config, "SMTP_USERNAME", "smtp-user")
    monkeypatch.setattr(mail_client.config, "SMTP_PASSWORD", "smtp-password")
    monkeypatch.setattr(mail_client.config, "SMTP_FROM_EMAIL", "no-reply@manualito.local")

    await mail_client.send_email(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Contenido",
        html_body="<html>…<img src='cid:manualito-logo'>…</html>",
    )

    message = send_mock.await_args.args[0]
    alternatives = list(message.iter_parts())
    related = alternatives[1]
    related_parts = list(related.iter_parts())
    html_part = related_parts[0]
    image_part = related_parts[1]
    logo_bytes = (Path(mail_client.__file__).parent / "assets" / "manualito-logo.png").read_bytes()

    assert message.is_multipart()
    assert message.get_content_type() == "multipart/alternative"
    assert alternatives[0].get_content_type() == "text/plain"
    assert related.get_content_type() == "multipart/related"
    assert html_part.get_content_type() == "text/html"
    assert "cid:manualito-logo" in html_part.get_content()
    assert image_part.get_content_type() == "image/png"
    assert image_part["Content-ID"] == "<manualito-logo>"
    assert image_part.get_payload(decode=True) == logo_bytes
    assert send_mock.await_args.kwargs == {
        "hostname": "mailpit",
        "port": 1025,
        "start_tls": False,
        "use_tls": False,
        "timeout": 10.0,
        "username": "smtp-user",
        "password": "smtp-password",
    }
