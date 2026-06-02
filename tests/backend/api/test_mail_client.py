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
    assert send_mock.await_args.kwargs == {
        "hostname": "mailpit",
        "port": 1025,
        "start_tls": False,
        "use_tls": False,
        "timeout": 10.0,
    }
