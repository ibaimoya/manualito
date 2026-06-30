"""Tasks Celery para explicaciones de juegos."""

from typing import NoReturn, Protocol
from uuid import UUID

import anyio
from celery.exceptions import SoftTimeLimitExceeded

from api import config
from api.games import explanations
from api.worker.celery import celery_app

EXTERNAL_ERROR_MAX_RETRIES = 2
LOCK_BUSY_MAX_RETRIES = 60
LOCK_BUSY_RETRY_SECONDS = 5
TASK_MAX_RETRIES = EXTERNAL_ERROR_MAX_RETRIES + LOCK_BUSY_MAX_RETRIES


class _RetryableTask(Protocol):
    def retry(self, *args: object, **kwargs: object) -> NoReturn: ...


@celery_app.task(  # type: ignore[untyped-decorator]
    name="api.worker.tasks.games.generate_game_explanation_task",
    bind=True,
    acks_late=True,
    max_retries=TASK_MAX_RETRIES,
    soft_time_limit=config.CELERY_GPU_SOFT_TIME_LIMIT,
    time_limit=config.CELERY_GPU_HARD_TIME_LIMIT,
)
def generate_game_explanation_task(
    self: _RetryableTask,
    user_id: str,
    game_id: str,
    lock_retry_count: int = 0,
    external_retry_count: int = 0,
) -> None:
    """Genera o completa la explicación cacheada de un juego."""
    parsed_user_id = UUID(user_id)
    parsed_game_id = UUID(game_id)
    try:
        completed = anyio.run(
            explanations.generate_game_explanation,
            parsed_user_id,
            parsed_game_id,
        )
    except (ConnectionError, TimeoutError) as exc:
        if external_retry_count >= EXTERNAL_ERROR_MAX_RETRIES:
            anyio.run(
                explanations.fail_game_explanation,
                parsed_user_id,
                parsed_game_id,
                "generation_failed",
            )
            return
        raise self.retry(
            exc=exc,
            countdown=10,
            args=(
                user_id,
                game_id,
                lock_retry_count,
                external_retry_count + 1,
            ),
        ) from exc
    except SoftTimeLimitExceeded:
        anyio.run(
            explanations.fail_game_explanation,
            parsed_user_id,
            parsed_game_id,
            "generation_failed",
        )
        return

    if not completed:
        if lock_retry_count >= LOCK_BUSY_MAX_RETRIES:
            anyio.run(
                explanations.fail_game_explanation,
                parsed_user_id,
                parsed_game_id,
                "generation_failed",
            )
            return
        raise self.retry(
            countdown=LOCK_BUSY_RETRY_SECONDS,
            args=(
                user_id,
                game_id,
                lock_retry_count + 1,
                external_retry_count,
            ),
        )
