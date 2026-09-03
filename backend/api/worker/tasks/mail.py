"""Envío de correo mediante Celery."""

from datetime import UTC, datetime
from email.utils import format_datetime
from functools import partial
from ssl import SSLCertVerificationError
from typing import NoReturn, Protocol

import aiosmtplib
import anyio
from celery.exceptions import SoftTimeLimitExceeded

from api import config
from api.mail.client import send_email
from api.worker.celery import celery_app

REDACTED_EMAIL_ARGS = "('<email oculto>', '<asunto oculto>', '<contenido oculto>', '<html oculto>')"


class _TaskRequest(Protocol):
    id: str | None
    retries: int
    headers: dict[str, str]


class _RetryableTask(Protocol):
    request: _TaskRequest
    max_retries: int

    def retry(self, *args: object, **kwargs: object) -> NoReturn: ...


class MailDeliveryError(RuntimeError):
    """Error de envío que puede registrarse sin revelar datos privados."""


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, aiosmtplib.SMTPRecipientsRefused):
        return bool(exc.recipients) and all(400 <= item.code < 500 for item in exc.recipients)
    if isinstance(exc, aiosmtplib.SMTPResponseException):
        return 400 <= exc.code < 500
    if isinstance(exc, SSLCertVerificationError):
        return False
    return isinstance(exc, (OSError, SoftTimeLimitExceeded))


def enqueue_email(
    *, to_email: str, subject: str, text_body: str, html_body: str | None = None
) -> None:
    """Encola el correo sin exponer su contenido en los eventos de Celery."""
    send_email_task.apply_async(
        args=(to_email, subject, text_body, html_body),
        argsrepr=REDACTED_EMAIL_ARGS,
        headers={"mail_date": format_datetime(datetime.now(UTC), usegmt=True)},
    )


@celery_app.task(  # type: ignore[untyped-decorator]
    name="api.worker.tasks.mail.send_email_task",
    bind=True,
    acks_late=True,
    max_retries=3,
    soft_time_limit=config.CELERY_MAIL_SOFT_TIME_LIMIT,
    time_limit=config.CELERY_MAIL_HARD_TIME_LIMIT,
)
def send_email_task(
    self: _RetryableTask,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
) -> None:
    """Envía el correo y reintenta los fallos temporales."""
    try:
        anyio.run(
            partial(
                send_email,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
                idempotency_key=self.request.id,
                message_date=self.request.headers["mail_date"],
            )
        )
    except (aiosmtplib.SMTPException, OSError, SoftTimeLimitExceeded) as exc:
        retryable = _is_transient(exc)
        failure = MailDeliveryError(f"No se pudo enviar el correo ({type(exc).__name__}).")
    else:
        return

    if retryable and self.request.retries < self.max_retries:
        self.retry(
            exc=failure,
            countdown=30 * 2**self.request.retries,
            argsrepr=REDACTED_EMAIL_ARGS,
        )
    raise failure
