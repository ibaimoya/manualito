"""Cliente SMTP pequeño para correos transaccionales."""

from email.message import EmailMessage

import aiosmtplib

from api import config


async def send_email(*, to_email: str, subject: str, text_body: str) -> None:
    """Envía un correo de texto usando el SMTP configurado."""
    message = EmailMessage()
    message["From"] = config.SMTP_FROM_EMAIL
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text_body)

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
