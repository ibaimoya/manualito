from datetime import UTC, datetime
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
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
    monkeypatch.setattr(mail_client.config, "SMTP_REPLY_TO", None)

    started_at = datetime.now(UTC).replace(microsecond=0)
    await mail_client.send_email(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Contenido",
    )

    message = BytesParser(policy=policy.default).parsebytes(
        send_mock.await_args.args[0].as_bytes(policy=policy.SMTP)
    )
    assert message["From"] == "no-reply@manualito.local"
    assert message["To"] == "user@example.com"
    assert message["Subject"] == "Asunto"
    assert started_at <= parsedate_to_datetime(message["Date"]) <= datetime.now(UTC)
    assert str(message["Message-ID"]).endswith("@manualito.local>")
    assert message.defects == []
    assert message["Reply-To"] is None
    assert message["Resend-Idempotency-Key"] is None
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


@pytest.mark.anyio
async def test_send_email_adds_reply_to_and_idempotency_key(monkeypatch):
    """Solo se sustituye la conexión SMTP para no enviar correos reales."""
    send_mock = AsyncMock()
    monkeypatch.setattr(mail_client.aiosmtplib, "send", send_mock)
    monkeypatch.setattr(mail_client.config, "SMTP_REPLY_TO", "support@manualito.dev")
    monkeypatch.setattr(mail_client.config, "SMTP_FROM_EMAIL", "Manualito <cuentas@manualito.dev>")

    await mail_client.send_email(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Contenido",
        idempotency_key="fcd3a3c5-02a1-4ed8-b68c-09f26b5c57f6",
        message_date="Wed, 16 Sep 2026 10:00:00 GMT",
    )

    message = send_mock.await_args.args[0]
    assert message["Reply-To"] == "support@manualito.dev"
    assert message["Resend-Idempotency-Key"] == "fcd3a3c5-02a1-4ed8-b68c-09f26b5c57f6"
    assert message["Message-ID"] == "<fcd3a3c5-02a1-4ed8-b68c-09f26b5c57f6@manualito.dev>"
    assert parsedate_to_datetime(message["Date"]) == datetime(2026, 9, 16, 10, tzinfo=UTC)
