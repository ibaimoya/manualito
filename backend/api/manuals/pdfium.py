"""Ejecución serializada de PDFium."""

from collections.abc import Callable

import anyio

_PDFIUM_LIMITER = anyio.CapacityLimiter(1)


async def run_pdfium[T](func: Callable[..., T], *args: object) -> T:
    """Ejecuta PDFium fuera del event loop, una operación por proceso."""
    return await anyio.to_thread.run_sync(func, *args, limiter=_PDFIUM_LIMITER)
