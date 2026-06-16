"""Aplicación Celery compartida por workers, Beat y Flower."""

from celery import Celery
from kombu import Queue

from api import config

celery_app = Celery(
    "manualito",
    broker=config.CELERY_BROKER_URL,
    backend=config.CELERY_RESULT_BACKEND,
    include=[
        "api.worker.tasks.manuals",
        "api.worker.tasks.conversations",
        "api.worker.tasks.games",
        "api.worker.tasks.mail",
        "api.worker.tasks.maintenance",
    ],
)

celery_app.conf.update(
    accept_content=["json"],
    enable_utc=True,
    result_expires=config.CELERY_RESULT_EXPIRES,
    result_serializer="json",
    task_serializer="json",
    task_create_missing_queues=False,
    task_default_queue="maintenance",
    task_ignore_result=True,
    task_store_errors_even_if_ignored=True,
    task_track_started=True,
    timezone="Europe/Madrid",
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        "visibility_timeout": config.CELERY_VISIBILITY_TIMEOUT,
    },
    result_backend_transport_options={
        "visibility_timeout": config.CELERY_VISIBILITY_TIMEOUT,
    },
    visibility_timeout=config.CELERY_VISIBILITY_TIMEOUT,
    beat_schedule={
        "worker-healthcheck": {
            "task": "api.worker.tasks.maintenance.healthcheck",
            "schedule": 300.0,
        },
        "recover-stale-manual-pages": {
            "task": "api.worker.tasks.maintenance.recover_stale_manual_pages",
            "schedule": 300.0,
        },
    },
    task_queues=(
        Queue("manuals"),
        Queue("rag"),
        Queue("gpu"),
        Queue("mail"),
        Queue("maintenance"),
    ),
    task_routes={
        "api.worker.tasks.manuals.process_manual_task": {"queue": "manuals"},
        "api.worker.tasks.manuals.process_manual_page_task": {"queue": "manuals"},
        "api.worker.tasks.manuals.reprocess_manual_task": {"queue": "manuals"},
        "api.worker.tasks.manuals.finalize_manual_task": {"queue": "rag"},
        "api.worker.tasks.manuals.sync_page_rag_task": {"queue": "rag"},
        "api.worker.tasks.manuals.delete_chunks_from_rag_task": {"queue": "rag"},
        "api.worker.tasks.conversations.generate_chat_reply_task": {"queue": "gpu"},
        "api.worker.tasks.conversations.refresh_conversation_title_task": {"queue": "gpu"},
        "api.worker.tasks.games.generate_game_explanation_task": {"queue": "gpu"},
        "api.worker.tasks.mail.send_email_task": {"queue": "mail"},
        "api.worker.tasks.maintenance.healthcheck": {"queue": "maintenance"},
        "api.worker.tasks.maintenance.recover_stale_manual_pages": {"queue": "maintenance"},
    },
)
