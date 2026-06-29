"""Tasks Celery para correo transaccional."""

import logging
from functools import partial
from typing import NoReturn, Protocol

import aiosmtplib
import anyio
from celery.exceptions import SoftTimeLimitExceeded

from api import config
from api.mail.client import send_email
from api.worker.celery import celery_app

logger = logging.getLogger(__name__)
REDACTED_EMAIL_ARGS = (
    "('<email oculto>', '<asunto oculto>', '<contenido oculto>', '<html oculto>')"
)


class _TaskRequest(Protocol):
    retries: int


class _RetryableTask(Protocol):
    request: _TaskRequest
    max_retries: int

    def retry(self, *args: object, **kwargs: object) -> NoReturn: ...


def enqueue_email(
    *, to_email: str, subject: str, text_body: str, html_body: str | None = None
) -> None:
    """Encola un email ocultando argumentos sensibles en eventos Celery."""
    send_email_task.apply_async(
        args=(to_email, subject, text_body, html_body),
        argsrepr=REDACTED_EMAIL_ARGS,
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
    """Envía un email transaccional sin bloquear la petición principal."""
    try:
        anyio.run(
            partial(
                send_email,
                to_email=to_email,
                subject=subject,
                text_body=text_body,
                html_body=html_body,
            )
        )
    except (aiosmtplib.SMTPException, OSError) as exc:
        if self.request.retries >= self.max_retries:
            logger.warning("No se pudo enviar un email transaccional.", exc_info=True)
            return
        raise self.retry(exc=exc, countdown=30) from exc
    except SoftTimeLimitExceeded:
        logger.warning("El envío de un email transaccional superó el tiempo límite.")
