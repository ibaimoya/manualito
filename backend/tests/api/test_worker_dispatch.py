"""Contratos asíncronos de publicación en la cola externa."""

import threading

import pytest

from api.worker.dispatch import dispatch_task


@pytest.mark.anyio
async def test_dispatch_task_keeps_the_event_loop_thread_free() -> None:
    """El doble representa el cliente Redis/Celery, una frontera externa bloqueante."""
    event_loop_thread = threading.get_ident()
    sender_thread: int | None = None
    received: tuple[object, ...] | None = None

    def blocking_sender(*args: object) -> object:
        nonlocal received, sender_thread
        sender_thread = threading.get_ident()
        received = args
        return object()

    await dispatch_task(blocking_sender, "manual-id", ["chunk-id"])

    assert received == ("manual-id", ["chunk-id"])
    assert sender_thread is not None
    assert sender_thread != event_loop_thread
