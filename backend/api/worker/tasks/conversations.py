"""Tasks Celery para conversaciones."""

from typing import NoReturn, Protocol
from uuid import UUID

import anyio
from celery.exceptions import SoftTimeLimitExceeded

from api import config
from api.conversations import service
from api.worker.celery import celery_app

EXTERNAL_ERROR_MAX_RETRIES = 2
LOCK_BUSY_MAX_RETRIES = 60
LOCK_BUSY_RETRY_SECONDS = 5
TASK_MAX_RETRIES = EXTERNAL_ERROR_MAX_RETRIES + LOCK_BUSY_MAX_RETRIES


class _RetryableTask(Protocol):
    def retry(self, *args: object, **kwargs: object) -> NoReturn: ...


@celery_app.task(  # type: ignore[untyped-decorator]
    name="api.worker.tasks.conversations.generate_chat_reply_task",
    bind=True,
    acks_late=True,
    max_retries=TASK_MAX_RETRIES,
    soft_time_limit=config.CELERY_GPU_SOFT_TIME_LIMIT,
    time_limit=config.CELERY_GPU_HARD_TIME_LIMIT,
)
def generate_chat_reply_task(
    self: _RetryableTask,
    user_id: str,
    conversation_id: str,
    user_message_id: str,
    assistant_message_id: str,
    top_k: int,
    lock_retry_count: int = 0,
    external_retry_count: int = 0,
) -> None:
    """Genera la respuesta pendiente de un turno de chat."""
    parsed_user_id = UUID(user_id)
    parsed_conversation_id = UUID(conversation_id)
    parsed_assistant_message_id = UUID(assistant_message_id)
    try:
        completed = anyio.run(
            service.generate_pending_reply,
            parsed_user_id,
            parsed_conversation_id,
            UUID(user_message_id),
            parsed_assistant_message_id,
            top_k,
        )
    except (ConnectionError, TimeoutError) as exc:
        if external_retry_count >= EXTERNAL_ERROR_MAX_RETRIES:
            anyio.run(
                service.fail_pending_reply,
                parsed_user_id,
                parsed_conversation_id,
                parsed_assistant_message_id,
                "generation_failed",
            )
            return
        raise self.retry(
            exc=exc,
            countdown=10,
            args=(
                user_id,
                conversation_id,
                user_message_id,
                assistant_message_id,
                top_k,
                lock_retry_count,
                external_retry_count + 1,
            ),
        ) from exc
    except SoftTimeLimitExceeded:
        anyio.run(
            service.fail_pending_reply,
            parsed_user_id,
            parsed_conversation_id,
            parsed_assistant_message_id,
            "generation_failed",
        )
        return

    if not completed:
        if lock_retry_count >= LOCK_BUSY_MAX_RETRIES:
            anyio.run(
                service.fail_pending_reply,
                parsed_user_id,
                parsed_conversation_id,
                parsed_assistant_message_id,
                "generation_failed",
            )
            return
        raise self.retry(
            countdown=LOCK_BUSY_RETRY_SECONDS,
            args=(
                user_id,
                conversation_id,
                user_message_id,
                assistant_message_id,
                top_k,
                lock_retry_count + 1,
                external_retry_count,
            ),
        )


@celery_app.task(  # type: ignore[untyped-decorator]
    name="api.worker.tasks.conversations.refresh_conversation_title_task",
    acks_late=True,
    autoretry_for=(ConnectionError, TimeoutError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=EXTERNAL_ERROR_MAX_RETRIES,
    soft_time_limit=config.CELERY_GPU_SOFT_TIME_LIMIT,
    time_limit=config.CELERY_GPU_HARD_TIME_LIMIT,
)
def refresh_conversation_title_task(
    user_id: str,
    conversation_id: str,
    user_message_id: str,
    expected_title: str,
) -> None:
    """Refina el título de una conversación fuera de la petición HTTP."""
    anyio.run(
        service.refresh_conversation_title,
        UUID(user_id),
        UUID(conversation_id),
        UUID(user_message_id),
        expected_title,
    )
