from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest
from billiard.exceptions import SoftTimeLimitExceeded

import api.worker.tasks.conversations as conversation_tasks
import api.worker.tasks.games as game_tasks
import api.worker.tasks.mail as mail_tasks
import api.worker.tasks.maintenance as maintenance_tasks
import api.worker.tasks.manuals as manual_tasks
from api import config
from api.worker.celery import celery_app

_USER_ID = UUID("018fd000-0000-7000-8000-000000000010")
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000011")
_MANUAL_ID = UUID("018fd000-0000-7000-8000-000000000015")
_CONVERSATION_ID = UUID("018fd000-0000-7000-8000-000000000012")
_USER_MESSAGE_ID = UUID("018fd000-0000-7000-8000-000000000013")
_ASSISTANT_MESSAGE_ID = UUID("018fd000-0000-7000-8000-000000000014")


def test_chat_task_marks_pending_reply_failed_when_lock_wait_expires(monkeypatch):
    """Si el lock no se libera tras los reintentos, el mensaje no queda pending."""
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        AsyncMock(return_value=False),
    )
    fail_mock = AsyncMock()
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)

    conversation_tasks.generate_chat_reply_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        conversation_tasks.LOCK_BUSY_MAX_RETRIES,
        0,
    )

    fail_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _ASSISTANT_MESSAGE_ID,
        "generation_failed",
    )


def test_game_task_marks_explanation_failed_when_lock_wait_expires(monkeypatch):
    """Si el lock de explicación no se libera, la caché no queda generando."""
    monkeypatch.setattr(
        game_tasks.explanations,
        "generate_game_explanation",
        AsyncMock(return_value=False),
    )
    fail_mock = AsyncMock()
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)

    game_tasks.generate_game_explanation_task.run(
        str(_USER_ID),
        str(_GAME_ID),
        game_tasks.LOCK_BUSY_MAX_RETRIES,
        0,
    )

    fail_mock.assert_awaited_once_with(_USER_ID, _GAME_ID, "generation_failed")


def test_enqueue_email_redacts_arguments_in_celery_events(monkeypatch):
    """Flower no debe mostrar destinatarios, tokens ni cuerpo del correo."""
    apply_mock = Mock()
    monkeypatch.setattr(mail_tasks.send_email_task, "apply_async", apply_mock)

    mail_tasks.enqueue_email(
        to_email="user@example.com",
        subject="Restablece tu contraseña",
        text_body="https://frontend/reset-password?token=secreto",
    )

    apply_mock.assert_called_once_with(
        args=(
            "user@example.com",
            "Restablece tu contraseña",
            "https://frontend/reset-password?token=secreto",
        ),
        argsrepr=mail_tasks.REDACTED_EMAIL_ARGS,
    )


def test_celery_config_is_strict_and_ignores_results_by_default():
    """La configuración evita colas fantasma y resultados que nadie consume."""
    assert celery_app.conf.task_ignore_result is True
    assert celery_app.conf.task_store_errors_even_if_ignored is True
    assert celery_app.conf.task_default_queue == "maintenance"
    assert celery_app.conf.task_create_missing_queues is False
    assert celery_app.conf.broker_connection_retry_on_startup is True
    assert celery_app.conf.worker_prefetch_multiplier == 1
    assert celery_app.conf.visibility_timeout == config.CELERY_VISIBILITY_TIMEOUT


def test_all_worker_tasks_have_explicit_declared_routes():
    """Toda task propia debe apuntar a una cola existente."""
    routes = celery_app.conf.task_routes
    queues = {queue.name for queue in celery_app.conf.task_queues}
    task_names = {
        name for name in celery_app.tasks if name.startswith("api.worker.tasks.")
    }

    assert task_names
    for task_name in task_names:
        assert task_name in routes
        assert routes[task_name]["queue"] in queues


def test_task_time_limits_stay_below_redis_visibility_timeout():
    """El hard limit nunca debe superar el visibility timeout de Redis."""
    for task_name in celery_app.conf.task_routes:
        task = celery_app.tasks[task_name]
        if task.time_limit is None:
            continue
        assert task.soft_time_limit < task.time_limit
        assert task.time_limit < config.CELERY_VISIBILITY_TIMEOUT


def test_process_manual_task_enqueues_page_tasks(monkeypatch):
    """El orquestador de manuales abre una task por página pendiente."""
    page_a = UUID("018fd000-0000-7000-8000-000000000021")
    page_b = UUID("018fd000-0000-7000-8000-000000000022")
    monkeypatch.setattr(
        manual_tasks.service,
        "process_manual",
        AsyncMock(return_value=[page_a, page_b]),
    )
    page_delay = Mock()
    finalize_delay = Mock()
    monkeypatch.setattr(manual_tasks.process_manual_page_task, "delay", page_delay)
    monkeypatch.setattr(manual_tasks.finalize_manual_task, "delay", finalize_delay)

    manual_tasks.process_manual_task.run(str(_MANUAL_ID))

    assert page_delay.call_args_list[0].args == (str(_MANUAL_ID), str(page_a))
    assert page_delay.call_args_list[1].args == (str(_MANUAL_ID), str(page_b))
    finalize_delay.assert_not_called()


def test_process_manual_task_finalizes_when_no_pages_remain(monkeypatch):
    """Si no quedan páginas pendientes, la task despierta el finalizador."""
    monkeypatch.setattr(manual_tasks.service, "process_manual", AsyncMock(return_value=[]))
    page_delay = Mock()
    finalize_delay = Mock()
    monkeypatch.setattr(manual_tasks.process_manual_page_task, "delay", page_delay)
    monkeypatch.setattr(manual_tasks.finalize_manual_task, "delay", finalize_delay)

    manual_tasks.process_manual_task.run(str(_MANUAL_ID))

    page_delay.assert_not_called()
    finalize_delay.assert_called_once_with(str(_MANUAL_ID))


def test_process_manual_page_task_marks_failed_on_soft_timeout(monkeypatch):
    """Un soft timeout de página actualiza estado de negocio y despierta cierre."""
    page_id = UUID("018fd000-0000-7000-8000-000000000023")
    monkeypatch.setattr(
        manual_tasks.service,
        "process_manual_page",
        AsyncMock(side_effect=SoftTimeLimitExceeded()),
    )
    fail_mock = AsyncMock()
    finalize_delay = Mock()
    monkeypatch.setattr(manual_tasks.service, "fail_manual_page", fail_mock)
    monkeypatch.setattr(manual_tasks.finalize_manual_task, "delay", finalize_delay)

    with pytest.raises(SoftTimeLimitExceeded):
        manual_tasks.process_manual_page_task.run(str(_MANUAL_ID), str(page_id))

    fail_mock.assert_awaited_once_with(_MANUAL_ID, page_id)
    finalize_delay.assert_called_once_with(str(_MANUAL_ID))


def test_finalize_manual_task_marks_manual_failed_on_soft_timeout(monkeypatch):
    """Un soft timeout en RAG no deja el manual bloqueado en indexing."""
    monkeypatch.setattr(
        manual_tasks.service,
        "finalize_manual",
        AsyncMock(side_effect=SoftTimeLimitExceeded()),
    )
    fail_mock = AsyncMock()
    monkeypatch.setattr(manual_tasks.service, "fail_manual", fail_mock)

    with pytest.raises(SoftTimeLimitExceeded):
        manual_tasks.finalize_manual_task.run(str(_MANUAL_ID))

    fail_mock.assert_awaited_once_with(_MANUAL_ID)


def test_recover_stale_manual_pages_enqueues_finalizers(monkeypatch):
    """El sweeper de Beat falla páginas colgadas y reintenta cerrar manuales."""
    monkeypatch.setattr(
        maintenance_tasks.manuals_service,
        "recover_stale_manual_pages",
        AsyncMock(return_value=[_MANUAL_ID]),
    )
    finalize_delay = Mock()
    monkeypatch.setattr(maintenance_tasks.finalize_manual_task, "delay", finalize_delay)

    maintenance_tasks.recover_stale_manual_pages.run()

    finalize_delay.assert_called_once_with(str(_MANUAL_ID))
