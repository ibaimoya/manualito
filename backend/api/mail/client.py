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
        message.add_alternative(html_body, subtype="html")
        message.get_payload()[-1].add_related(
            _LOGO_BYTES,
            maintype="image",
            subtype="png",
            cid=f"<{LOGO_CID}>",
            disposition="inline",
            filename="manualito-logo.png",
        )

    send_options = {
        "hostname": config.SMTP_HOST,
        "port": config.SMTP_PORT,
        "start_tls": config.SMTP_STARTTLS,
        "use_tls": config.SMTP_USE_TLS,
        "timeout": config.SMTP_TIMEOUT,
    }
    if config.SMTP_USERNAME:
        send_options["username"] = config.SMTP_USERNAME
    if config.SMTP_PASSWORD:
        send_options["password"] = config.SMTP_PASSWORD

    await aiosmtplib.send(message, **send_options)
