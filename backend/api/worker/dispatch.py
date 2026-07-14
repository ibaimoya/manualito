"""Puente asíncrono hacia el cliente síncrono de Celery."""

from collections.abc import Callable

import anyio


async def dispatch_task(sender: Callable[..., object], *args: object) -> None:
    """Publica fuera del event loop y espera un resultado de envío definido."""
    await anyio.to_thread.run_sync(
        sender,
        *args,
        abandon_on_cancel=False,
    )
