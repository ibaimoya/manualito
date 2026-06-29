"""Cliente SMTP pequeño para correos transaccionales."""

from email.message import EmailMessage
from pathlib import Path

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
) -> None:
    """Envía un correo de texto y, si se indica, una alternativa HTML con logo."""
    message = EmailMessage()
    message["From"] = config.SMTP_FROM_EMAIL
    message["To"] = to_email
    message["Subject"] = subject
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
        message.make_alternative()
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
