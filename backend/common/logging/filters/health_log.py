from __future__ import annotations

import logging
from collections.abc import Callable

_HEALTH_METHODS = frozenset({"GET", "HEAD"})


def _extract_health_status(message: str) -> str | None:
    """Extrae el codigo HTTP de un access log de /health.

    Args:
        message: Linea de access log generada por Uvicorn.

    Returns:
        Codigo HTTP de tres digitos si la linea corresponde a un sondeo
        GET/HEAD de /health; ``None`` en caso contrario.
    """
    request_start = message.find('"')
    if request_start == -1:
        return None

    request_end = message.find('"', request_start + 1)
    if request_end == -1:
        return None

    request_parts = message[request_start + 1 : request_end].split(" ", 2)
    if len(request_parts) != 3:
        return None

    method, path, version = request_parts
    if method not in _HEALTH_METHODS:
        return None
    if path.partition("?")[0] != "/health":
        return None
    if not version.startswith("HTTP/"):
        return None

    status_parts = message[request_end + 1 :].lstrip().split(" ", 1)
    if not status_parts:
        return None
    status = status_parts[0]
    if len(status) != 3 or not status.isdigit():
        return None

    return status


def make_health_log_filter() -> Callable[[logging.LogRecord], bool]:
    """Construye un filtro de logging que suprime los sondeos sanos repetidos a /health.

    El filtro mantiene estado entre llamadas: deja pasar la primera respuesta
    sana (2xx), cualquier respuesta no-2xx con su codigo, y la recuperacion
    tras un fallo. Los 2xx consecutivos al ultimo se silencian para evitar
    saturar los logs con el sondeo periodico de Docker.

    Returns:
        Callable[[logging.LogRecord], bool]: Funcion filtro compatible con
            el sistema de logging estandar. Devuelve True si el registro
            debe emitirse y False si debe suprimirse.
    """
    last_ok = False

    def _filter(record: logging.LogRecord) -> bool:
        nonlocal last_ok
        status = _extract_health_status(record.getMessage())
        if status is None:
            return True  # no es un sondeo /health: pasa
        ok = status.startswith("2")
        if ok and last_ok:
            return False  # sano repetido: suprime
        last_ok = ok
        return True

    return _filter


def install_health_log_filter() -> None:
    """Instala el filtro en el logger uvicorn.access.

    Debe llamarse una sola vez durante el arranque de cada servicio FastAPI,
    antes de que Uvicorn empiece a aceptar peticiones.
    """
    logging.getLogger("uvicorn.access").addFilter(make_health_log_filter())
