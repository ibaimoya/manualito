from unittest.mock import AsyncMock, Mock
from uuid import UUID

import pytest
from billiard.exceptions import SoftTimeLimitExceeded
from celery.exceptions import Retry

import api.worker.tasks.conversations as conversation_tasks
import api.worker.tasks.games as game_tasks
import api.worker.tasks.mail as mail_tasks
import api.worker.tasks.maintenance as maintenance_tasks
import api.worker.tasks.manuals as manual_tasks
from api import config
from api.manuals.dto import ReconciliationPlan
from api.worker.celery import celery_app

_USER_ID = UUID("018fd000-0000-7000-8000-000000000010")
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000011")
_MANUAL_ID = UUID("018fd000-0000-7000-8000-000000000015")
_CONVERSATION_ID = UUID("018fd000-0000-7000-8000-000000000012")
_USER_MESSAGE_ID = UUID("018fd000-0000-7000-8000-000000000013")
_ASSISTANT_MESSAGE_ID = UUID("018fd000-0000-7000-8000-000000000014")


def test_chat_task_marks_pending_reply_failed_when_lock_wait_expires(monkeypatch):
    """Si el lock no se libera tras los reintentos, el mensaje no queda pending."""
    generate_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        generate_mock,
    )
    fail_mock = AsyncMock()
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)

    conversation_tasks.generate_chat_reply_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "en",
        conversation_tasks.LOCK_BUSY_MAX_RETRIES,
        0,
    )

    generate_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _USER_MESSAGE_ID,
        _ASSISTANT_MESSAGE_ID,
        4,
        "en",
    )
    fail_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _ASSISTANT_MESSAGE_ID,
        "generation_failed",
    )


def test_chat_task_completes_without_retry(monkeypatch):
    """Una respuesta completada conserva el idioma y no se reencola."""
    generate_mock = AsyncMock(return_value=True)
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(conversation_tasks.service, "generate_pending_reply", generate_mock)
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)
    monkeypatch.setattr(conversation_tasks.generate_chat_reply_task, "retry", retry_mock)

    conversation_tasks.generate_chat_reply_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "en",
    )

    generate_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _USER_MESSAGE_ID,
        _ASSISTANT_MESSAGE_ID,
        4,
        "en",
    )
    fail_mock.assert_not_awaited()
    retry_mock.assert_not_called()


def test_chat_task_retries_external_errors_with_language(monkeypatch):
    """Un fallo externo reencola los mismos datos y conserva el idioma."""
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        AsyncMock(side_effect=ConnectionError("llm caído")),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=Retry())
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)
    monkeypatch.setattr(conversation_tasks.generate_chat_reply_task, "retry", retry_mock)
    user_id = str(_USER_ID)
    conversation_id = str(_CONVERSATION_ID)
    user_message_id = str(_USER_MESSAGE_ID)
    assistant_message_id = str(_ASSISTANT_MESSAGE_ID)

    with pytest.raises(Retry):
        conversation_tasks.generate_chat_reply_task.run(
            user_id,
            conversation_id,
            user_message_id,
            assistant_message_id,
            4,
            "en",
            7,
            1,
        )

    fail_mock.assert_not_awaited()
    assert retry_mock.call_args.kwargs["countdown"] == 10
    assert retry_mock.call_args.kwargs["args"] == (
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "en",
        7,
        2,
    )


def test_chat_task_fails_when_external_retries_are_exhausted(monkeypatch):
    """Al agotar fallos externos el mensaje pendiente queda marcado como fallido."""
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        AsyncMock(side_effect=TimeoutError("llm caído")),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)
    monkeypatch.setattr(conversation_tasks.generate_chat_reply_task, "retry", retry_mock)

    conversation_tasks.generate_chat_reply_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "es",
        0,
        conversation_tasks.EXTERNAL_ERROR_MAX_RETRIES,
    )

    fail_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _ASSISTANT_MESSAGE_ID,
        "generation_failed",
    )
    retry_mock.assert_not_called()


def test_chat_task_marks_pending_reply_failed_on_soft_timeout(monkeypatch):
    """Un límite blando agotado no deja el mensaje en estado pendiente."""
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        AsyncMock(side_effect=SoftTimeLimitExceeded()),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)
    monkeypatch.setattr(conversation_tasks.generate_chat_reply_task, "retry", retry_mock)

    conversation_tasks.generate_chat_reply_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "es",
    )

    fail_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _ASSISTANT_MESSAGE_ID,
        "generation_failed",
    )
    retry_mock.assert_not_called()


def test_chat_task_retries_when_lock_is_temporarily_busy(monkeypatch):
    """Un lock ocupado reencola el turno sin cambiar idioma ni contador externo."""
    monkeypatch.setattr(
        conversation_tasks.service,
        "generate_pending_reply",
        AsyncMock(return_value=False),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=Retry())
    monkeypatch.setattr(conversation_tasks.service, "fail_pending_reply", fail_mock)
    monkeypatch.setattr(conversation_tasks.generate_chat_reply_task, "retry", retry_mock)
    user_id = str(_USER_ID)
    conversation_id = str(_CONVERSATION_ID)
    user_message_id = str(_USER_MESSAGE_ID)
    assistant_message_id = str(_ASSISTANT_MESSAGE_ID)

    with pytest.raises(Retry):
        conversation_tasks.generate_chat_reply_task.run(
            user_id,
            conversation_id,
            user_message_id,
            assistant_message_id,
            4,
            "en",
            3,
            1,
        )

    fail_mock.assert_not_awaited()
    assert retry_mock.call_args.kwargs["countdown"] == (
        conversation_tasks.LOCK_BUSY_RETRY_SECONDS
    )
    assert retry_mock.call_args.kwargs["args"] == (
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        str(_ASSISTANT_MESSAGE_ID),
        4,
        "en",
        4,
        1,
    )


def test_title_task_forwards_resolved_language(monkeypatch):
    """La tarea de título recibe el mismo idioma que la respuesta del turno."""
    refresh_mock = AsyncMock()
    monkeypatch.setattr(
        conversation_tasks.service,
        "refresh_conversation_title",
        refresh_mock,
    )

    conversation_tasks.refresh_conversation_title_task.run(
        str(_USER_ID),
        str(_CONVERSATION_ID),
        str(_USER_MESSAGE_ID),
        "Fallback",
        "en",
    )

    refresh_mock.assert_awaited_once_with(
        _USER_ID,
        _CONVERSATION_ID,
        _USER_MESSAGE_ID,
        "Fallback",
        "en",
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


def test_game_task_completes_without_retry_when_generation_finishes(monkeypatch):
    """Una explicación completada no debe marcar error ni reencolar la task."""
    generate_mock = AsyncMock(return_value=True)
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(game_tasks.explanations, "generate_game_explanation", generate_mock)
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)
    monkeypatch.setattr(game_tasks.generate_game_explanation_task, "retry", retry_mock)

    game_tasks.generate_game_explanation_task.run(str(_USER_ID), str(_GAME_ID))

    generate_mock.assert_awaited_once_with(_USER_ID, _GAME_ID)
    fail_mock.assert_not_awaited()
    retry_mock.assert_not_called()


def test_game_task_retries_external_errors_with_separate_counter(monkeypatch):
    """Los fallos externos reintentan sin consumir el contador de lock ocupado."""
    monkeypatch.setattr(
        game_tasks.explanations,
        "generate_game_explanation",
        AsyncMock(side_effect=ConnectionError("llm caído")),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=Retry())
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)
    monkeypatch.setattr(game_tasks.generate_game_explanation_task, "retry", retry_mock)
    user_id = str(_USER_ID)
    game_id = str(_GAME_ID)

    with pytest.raises(Retry):
        game_tasks.generate_game_explanation_task.run(user_id, game_id, 7, 1)

    fail_mock.assert_not_awaited()
    retry_mock.assert_called_once()
    assert retry_mock.call_args.kwargs["countdown"] == 10
    assert retry_mock.call_args.kwargs["args"] == (str(_USER_ID), str(_GAME_ID), 7, 2)


def test_game_task_fails_explanation_when_external_retries_are_exhausted(monkeypatch):
    """Al agotar errores externos, la explicación queda failed y no se reintenta."""
    monkeypatch.setattr(
        game_tasks.explanations,
        "generate_game_explanation",
        AsyncMock(side_effect=TimeoutError("timeout llm")),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)
    monkeypatch.setattr(game_tasks.generate_game_explanation_task, "retry", retry_mock)

    game_tasks.generate_game_explanation_task.run(
        str(_USER_ID),
        str(_GAME_ID),
        3,
        game_tasks.EXTERNAL_ERROR_MAX_RETRIES,
    )

    fail_mock.assert_awaited_once_with(_USER_ID, _GAME_ID, "generation_failed")
    retry_mock.assert_not_called()


def test_game_task_marks_explanation_failed_on_soft_timeout(monkeypatch):
    """Un soft timeout de GPU no deja la explicación bloqueada en generating."""
    monkeypatch.setattr(
        game_tasks.explanations,
        "generate_game_explanation",
        AsyncMock(side_effect=SoftTimeLimitExceeded()),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)
    monkeypatch.setattr(game_tasks.generate_game_explanation_task, "retry", retry_mock)

    game_tasks.generate_game_explanation_task.run(str(_USER_ID), str(_GAME_ID))

    fail_mock.assert_awaited_once_with(_USER_ID, _GAME_ID, "generation_failed")
    retry_mock.assert_not_called()


def test_game_task_retries_when_gpu_lock_is_temporarily_busy(monkeypatch):
    """Si el lock sigue ocupado pero no agotado, reencola sin tocar errores externos."""
    monkeypatch.setattr(
        game_tasks.explanations,
        "generate_game_explanation",
        AsyncMock(return_value=False),
    )
    fail_mock = AsyncMock()
    retry_mock = Mock(side_effect=Retry())
    monkeypatch.setattr(game_tasks.explanations, "fail_game_explanation", fail_mock)
    monkeypatch.setattr(game_tasks.generate_game_explanation_task, "retry", retry_mock)
    user_id = str(_USER_ID)
    game_id = str(_GAME_ID)

    with pytest.raises(Retry):
        game_tasks.generate_game_explanation_task.run(user_id, game_id, 4, 1)

    fail_mock.assert_not_awaited()
    retry_mock.assert_called_once()
    assert retry_mock.call_args.kwargs["countdown"] == game_tasks.LOCK_BUSY_RETRY_SECONDS
    assert retry_mock.call_args.kwargs["args"] == (str(_USER_ID), str(_GAME_ID), 5, 1)


def test_enqueue_email_redacts_arguments_in_celery_events(monkeypatch):
    """Flower no debe mostrar destinatarios, tokens ni cuerpo del correo."""
    apply_mock = Mock()
    monkeypatch.setattr(mail_tasks.send_email_task, "apply_async", apply_mock)

    mail_tasks.enqueue_email(
        to_email="user@example.com",
        subject="Restablece tu contraseña",
        text_body="https://frontend/reset-password?token=secreto",
        html_body="<html>secreto</html>",
    )

    apply_mock.assert_called_once_with(
        args=(
            "user@example.com",
            "Restablece tu contraseña",
            "https://frontend/reset-password?token=secreto",
            "<html>secreto</html>",
        ),
        argsrepr=mail_tasks.REDACTED_EMAIL_ARGS,
    )


def test_send_email_task_forwards_html_body(monkeypatch):
    """La task de correo conserva la alternativa HTML al invocar el cliente SMTP."""
    send_mock = AsyncMock()
    monkeypatch.setattr(mail_tasks, "send_email", send_mock)

    mail_tasks.send_email_task.run("user@example.com", "Asunto", "Texto", "<html>Texto</html>")

    send_mock.assert_awaited_once_with(
        to_email="user@example.com",
        subject="Asunto",
        text_body="Texto",
        html_body="<html>Texto</html>",
    )


def test_send_email_task_retries_smtp_errors(monkeypatch):
    """La task de correo reintenta errores SMTP transitorios."""
    send_mock = AsyncMock(side_effect=mail_tasks.aiosmtplib.SMTPException("smtp down"))
    retry_mock = Mock(side_effect=Retry())
    monkeypatch.setattr(mail_tasks, "send_email", send_mock)
    monkeypatch.setattr(mail_tasks.send_email_task, "retry", retry_mock)

    mail_tasks.send_email_task.push_request(retries=0)
    try:
        with pytest.raises(Retry):
            mail_tasks.send_email_task.run("user@example.com", "Asunto", "Texto")
    finally:
        mail_tasks.send_email_task.pop_request()

    retry_mock.assert_called_once()
    assert retry_mock.call_args.kwargs["countdown"] == 30
    assert isinstance(retry_mock.call_args.kwargs["exc"], mail_tasks.aiosmtplib.SMTPException)


def test_send_email_task_stops_when_retries_are_exhausted(monkeypatch):
    """La task de correo registra el fallo final sin reintentar indefinidamente."""
    send_mock = AsyncMock(side_effect=OSError("network down"))
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(mail_tasks, "send_email", send_mock)
    monkeypatch.setattr(mail_tasks.send_email_task, "retry", retry_mock)

    mail_tasks.send_email_task.push_request(retries=mail_tasks.send_email_task.max_retries)
    try:
        mail_tasks.send_email_task.run("user@example.com", "Asunto", "Texto")
    finally:
        mail_tasks.send_email_task.pop_request()

    retry_mock.assert_not_called()


def test_send_email_task_logs_soft_timeout(monkeypatch):
    """La task de correo no reintenta si Celery corta por soft timeout."""
    send_mock = AsyncMock(side_effect=mail_tasks.SoftTimeLimitExceeded())
    retry_mock = Mock(side_effect=AssertionError("no debe reintentarse"))
    monkeypatch.setattr(mail_tasks, "send_email", send_mock)
    monkeypatch.setattr(mail_tasks.send_email_task, "retry", retry_mock)

    mail_tasks.send_email_task.run("user@example.com", "Asunto", "Texto")

    retry_mock.assert_not_called()


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
    manual_id = str(_MANUAL_ID)
    page_id_value = str(page_id)

    with pytest.raises(SoftTimeLimitExceeded):
        manual_tasks.process_manual_page_task.run(manual_id, page_id_value)

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
    manual_id = str(_MANUAL_ID)

    with pytest.raises(SoftTimeLimitExceeded):
        manual_tasks.finalize_manual_task.run(manual_id)

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


def test_reindex_manual_task_parsea_uuid(monkeypatch) -> None:
    """La task entrega al servicio el UUID deserializado del manual."""
    reindex_mock = AsyncMock()
    monkeypatch.setattr(manual_tasks.service, "reindex_manual", reindex_mock)

    manual_tasks.reindex_manual_task.run(str(_MANUAL_ID))

    reindex_mock.assert_awaited_once_with(_MANUAL_ID)


@pytest.mark.parametrize(
    ("plan", "expected_deletions", "expected_reindexes"),
    [
        (
            ReconciliationPlan(
                orphan_chunk_ids={
                    "11111111-1111-4111-8111-111111111111": [
                        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    ],
                    "22222222-2222-4222-8222-222222222222": [
                        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    ],
                },
                stale_manual_ids=[
                    "33333333-3333-4333-8333-333333333333",
                    "44444444-4444-4444-8444-444444444444",
                ],
            ),
            {
                "11111111-1111-4111-8111-111111111111": [
                    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                ],
                "22222222-2222-4222-8222-222222222222": [
                    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                ],
            },
            [
                "33333333-3333-4333-8333-333333333333",
                "44444444-4444-4444-8444-444444444444",
            ],
        ),
        (
            ReconciliationPlan(orphan_chunk_ids={}, stale_manual_ids=[]),
            {},
            [],
        ),
    ],
    ids=["plan-poblado", "plan-vacio"],
)
def test_reconcile_rag_index_encola_el_plan(
    monkeypatch: pytest.MonkeyPatch,
    plan: ReconciliationPlan,
    expected_deletions: dict[str, list[str]],
    expected_reindexes: list[str],
) -> None:
    """La task encola exactamente las reparaciones incluidas en el plan."""
    plan_mock = AsyncMock(return_value=plan)
    delete_delay = Mock()
    reindex_delay = Mock()
    monkeypatch.setattr(maintenance_tasks.manuals_service, "plan_index_repair", plan_mock)
    monkeypatch.setattr(
        maintenance_tasks.delete_chunks_from_rag_task,
        "delay",
        delete_delay,
    )
    monkeypatch.setattr(maintenance_tasks.reindex_manual_task, "delay", reindex_delay)

    maintenance_tasks.reconcile_rag_index.run()

    plan_mock.assert_awaited_once_with()
    assert delete_delay.call_count == len(expected_deletions)
    for manual_id, chunk_ids in expected_deletions.items():
        delete_delay.assert_any_call(manual_id, chunk_ids)
    assert reindex_delay.call_count == len(expected_reindexes)
    for manual_id in expected_reindexes:
        reindex_delay.assert_any_call(manual_id)
