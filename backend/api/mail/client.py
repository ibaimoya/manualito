"""Envío de correos transaccionales por SMTP."""

from datetime import UTC, datetime
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import format_datetime, parseaddr
from pathlib import Path
from uuid import uuid4

import aiosmtplib

from api import config

LOGO_CID = "manualito-logo"
_LOGO_BYTES = (Path(__file__).parent / "assets" / "manualito-logo.png").read_bytes()


async def send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    idempotency_key: str | None = None,
    message_date: str | None = None,
) -> None:
    """Envía un correo de texto y, si se indica, una alternativa HTML con logo."""
    message = EmailMessage()
    message["From"] = config.SMTP_FROM_EMAIL
    message["To"] = to_email
    message["Subject"] = subject
    message_key = idempotency_key or str(uuid4())
    sender_domain = Address(addr_spec=parseaddr(config.SMTP_FROM_EMAIL)[1]).domain
    message["Message-ID"] = f"<{message_key}@{sender_domain}>"
    message["Date"] = message_date or format_datetime(datetime.now(UTC), usegmt=True)
    if config.SMTP_REPLY_TO:
        message["Reply-To"] = config.SMTP_REPLY_TO
    if idempotency_key:
        message["Resend-Idempotency-Key"] = idempotency_key
    message.set_content(text_body)
    if html_body is not None:
        html_part = EmailMessage()
        html_part.set_content(html_body, subtype="html")
        html_part.add_related(
            _LOGO_BYTES,
            maintype="image",
            subtype="png",
            cid=f"<{LOGO_CID}>",
            disposition="inline",
            filename="manualito-logo.png",
        )
        html_part.set_boundary(f"manualito-related-{message_key}")
        message.make_alternative(boundary=f"manualito-alternative-{message_key}")
        message.attach(html_part)

    await aiosmtplib.send(
        message,
        hostname=config.SMTP_HOST,
        port=config.SMTP_PORT,
        start_tls=config.SMTP_STARTTLS,
        use_tls=config.SMTP_USE_TLS,
        timeout=config.SMTP_TIMEOUT,
        username=config.SMTP_USERNAME,
        password=config.SMTP_PASSWORD,
    )
