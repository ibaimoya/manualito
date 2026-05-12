from __future__ import annotations

import logging
import re
from collections.abc import Callable

# Access log de Uvicorn: '<addr> - "METHOD /path HTTP/ver" STATUS REASON'.
# Captura el código HTTP solo cuando el método es GET/HEAD y la ruta es
# exactamente /health (opcionalmente con query string). Evita falsos
# positivos con rutas que empiezan por /health (/healthz, /health/detailed).
HEALTH_PROBE_PATTERN = re.compile(
    r'"(?:GET|HEAD) /health(?:\?[^"]*)? HTTP/[^"]*" (\d{3})'
)


def make_health_log_filter() -> Callable[[logging.LogRecord], bool]:
    """Construye un filtro de logging que suprime los sondeos sanos repetidos a /health.

    El filtro mantiene estado entre llamadas: deja pasar la primera respuesta
    sana (2xx), cualquier respuesta no-2xx con su código, y la recuperación
    tras un fallo. Los 2xx consecutivos al último se silencian para evitar
    saturar los logs con el sondeo periódico de Docker.

    Returns:
        Callable[[logging.LogRecord], bool]: Función filtro compatible con
            el sistema de logging estándar. Devuelve True si el registro
            debe emitirse y False si debe suprimirse.
    """
    last_ok = False

    def _filter(record: logging.LogRecord) -> bool:
        nonlocal last_ok
        match = HEALTH_PROBE_PATTERN.search(record.getMessage())
        if match is None:
            return True  # no es un sondeo /health: pasa
        ok = match.group(1).startswith("2")
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
