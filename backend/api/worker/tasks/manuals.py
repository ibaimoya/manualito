"""Tasks Celery para manuales, OCR y sincronización RAG."""

from uuid import UUID

import anyio
from billiard.exceptions import SoftTimeLimitExceeded

from api import config
from api.manuals import service
from api.worker.celery import celery_app

IO_RETRY_TASK_OPTIONS = {
    "acks_late": True,
    "autoretry_for": (ConnectionError, TimeoutError),
    "retry_backoff": True,
    "retry_jitter": True,
    "max_retries": 3,
}


def _with_limits(options: dict, *, soft: int, hard: int) -> dict:
    """Añade límites temporales a opciones de task sin duplicar configuración."""
    return options | {"soft_time_limit": soft, "time_limit": hard}


MANUAL_PAGE_TASK_OPTIONS = _with_limits(
    IO_RETRY_TASK_OPTIONS,
    soft=config.CELERY_MANUAL_PAGE_SOFT_TIME_LIMIT,
    hard=config.CELERY_MANUAL_PAGE_HARD_TIME_LIMIT,
)
MANUAL_FINALIZE_TASK_OPTIONS = _with_limits(
    IO_RETRY_TASK_OPTIONS,
    soft=config.CELERY_MANUAL_FINALIZE_SOFT_TIME_LIMIT,
    hard=config.CELERY_MANUAL_FINALIZE_HARD_TIME_LIMIT,
)
RAG_TASK_OPTIONS = _with_limits(
    IO_RETRY_TASK_OPTIONS,
    soft=config.CELERY_RAG_SOFT_TIME_LIMIT,
    hard=config.CELERY_RAG_HARD_TIME_LIMIT,
)


@celery_app.task(
    name="api.worker.tasks.manuals.process_manual_task",
    **MANUAL_PAGE_TASK_OPTIONS,
)
def process_manual_task(manual_id: str) -> None:
    """Encola las páginas pendientes de un manual."""
    page_ids = anyio.run(service.process_manual, UUID(manual_id))
    _enqueue_manual_pages(manual_id, page_ids)


@celery_app.task(
    name="api.worker.tasks.manuals.process_manual_page_task",
    **MANUAL_PAGE_TASK_OPTIONS,
)
def process_manual_page_task(manual_id: str, page_id: str) -> None:
    """Procesa una página del manual y despierta el finalizador."""
    try:
        anyio.run(service.process_manual_page, UUID(manual_id), UUID(page_id))
    except SoftTimeLimitExceeded:
        anyio.run(service.fail_manual_page, UUID(manual_id), UUID(page_id))
        raise
    finally:
        finalize_manual_task.delay(manual_id)


@celery_app.task(
    name="api.worker.tasks.manuals.finalize_manual_task",
    **MANUAL_FINALIZE_TASK_OPTIONS,
)
def finalize_manual_task(manual_id: str) -> None:
    """Indexa el manual cuando todas sus páginas han terminado."""
    try:
        anyio.run(service.finalize_manual, UUID(manual_id))
    except SoftTimeLimitExceeded:
        anyio.run(service.fail_manual, UUID(manual_id))
        raise


@celery_app.task(
    name="api.worker.tasks.manuals.reprocess_manual_task",
    **MANUAL_PAGE_TASK_OPTIONS,
)
def reprocess_manual_task(manual_id: str, stale_chunk_ids: list[str]) -> None:
    """Limpia chunks obsoletos y relanza el procesamiento del manual."""
    page_ids = anyio.run(
        service.run_reprocess,
        UUID(manual_id),
        _uuids(stale_chunk_ids),
    )
    _enqueue_manual_pages(manual_id, page_ids)


@celery_app.task(
    name="api.worker.tasks.manuals.sync_page_rag_task",
    **RAG_TASK_OPTIONS,
)
def sync_page_rag_task(manual_id: str, page_id: str, stale_chunk_ids: list[str]) -> None:
    """Sincroniza en RAG una página editada manualmente."""
    anyio.run(
        service.sync_page_rag,
        UUID(manual_id),
        UUID(page_id),
        _uuids(stale_chunk_ids),
    )


@celery_app.task(
    name="api.worker.tasks.manuals.delete_chunks_from_rag_task",
    **RAG_TASK_OPTIONS,
)
def delete_chunks_from_rag_task(manual_id: str, chunk_ids: list[str]) -> None:
    """Borra de RAG chunks derivados de un manual."""
    anyio.run(
        service.delete_chunks_from_rag_by_ids,
        UUID(manual_id),
        _uuids(chunk_ids),
    )


def _enqueue_manual_pages(manual_id: str, page_ids: list[UUID]) -> None:
    """Encola páginas concretas o finaliza si no queda nada pendiente."""
    if not page_ids:
        finalize_manual_task.delay(manual_id)
        return
    for page_id in page_ids:
        process_manual_page_task.delay(manual_id, str(page_id))


def _uuids(values: list[str]) -> list[UUID]:
    """Convierte IDs opacos serializados por Celery a UUID."""
    return [UUID(value) for value in values]
