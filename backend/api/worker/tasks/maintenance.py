"""Tasks periódicas de mantenimiento."""

import anyio

from api import config
from api.manuals import service as manuals_service
from api.worker.celery import celery_app
from api.worker.tasks.manuals import finalize_manual_task

MAINTENANCE_TASK_OPTIONS = {
    "soft_time_limit": config.CELERY_MAINTENANCE_SOFT_TIME_LIMIT,
    "time_limit": config.CELERY_MAINTENANCE_HARD_TIME_LIMIT,
}


@celery_app.task(
    name="api.worker.tasks.maintenance.healthcheck",
    **MAINTENANCE_TASK_OPTIONS,
)
def healthcheck() -> str:
    """Task mínima para verificar que Beat y los workers están vivos."""
    return "ok"


@celery_app.task(
    name="api.worker.tasks.maintenance.recover_stale_manual_pages",
    **MAINTENANCE_TASK_OPTIONS,
)
def recover_stale_manual_pages() -> None:
    """Recupera páginas de manual abandonadas tras un corte de worker."""
    manual_ids = anyio.run(manuals_service.recover_stale_manual_pages)
    for manual_id in manual_ids:
        finalize_manual_task.delay(str(manual_id))
