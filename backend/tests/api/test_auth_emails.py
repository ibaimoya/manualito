from unittest.mock import AsyncMock

import aiosmtplib
import pytest

from api.auth import emails


@pytest.mark.anyio
async def test_send_email_safely_swallows_smtp_errors(monkeypatch):
    """El envío best-effort no rompe la request si SMTP falla."""
    send_mock = AsyncMock(side_effect=aiosmtplib.SMTPException("smtp down"))
    monkeypatch.setattr(emails, "send_email", send_mock)

    await emails.send_email_safely(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Contenido",
    )

    send_mock.assert_awaited_once()


def test_auth_email_links_use_frontend_public_url(monkeypatch):
    """Los enlaces apuntan al frontend y transportan el token por query param."""
    monkeypatch.setattr(emails.config, "FRONTEND_PUBLIC_URL", "http://frontend.local/")

    body = emails._password_reset_email_body(username="Nora", token="token con espacios")

    assert "http://frontend.local/reset-password?token=token+con+espacios" in body
