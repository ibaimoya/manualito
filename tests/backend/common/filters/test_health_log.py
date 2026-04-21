from __future__ import annotations

import logging

import pytest

from common.filters import (
    install_health_log_filter,
    make_health_log_filter,
)


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------

def _make_record(msg: str) -> logging.LogRecord:
    """Construye un LogRecord sintético con el mensaje dado."""
    return logging.makeLogRecord({"msg": msg, "args": None})


def _access_line(method: str, path: str, version: str, status: int) -> str:
    """Genera una línea de access log con el formato exacto de Uvicorn."""
    return f'127.0.0.1:44566 - "{method} {path} {version}" {status} OK'


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — máquina de estados del filtro
#   Clase 1: [200]                  → [True]                    (arranque sano).
#   Clase 2: [200, 200]             → [True, False]             (repetición suprimida).
#   Clase 3: [200, 200, 200]        → [True, False, False]      (todas suprimidas salvo la primera).
#   Clase 4: [200, 500]             → [True, True]              (error tras sano loguea).
#   Clase 5: [500, 500]             → [True, True]              (errores consecutivos todos loguean).
#   Clase 6: [500, 200]             → [True, True]              (recuperación loguea).
#   Clase 7: [200, 500, 200, 200]   → [True, True, True, False] (ciclo completo).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("statuses,expected", [
    ([200],                [True]),
    ([200, 200],           [True, False]),
    ([200, 200, 200],      [True, False, False]),
    ([200, 500],           [True, True]),
    ([500, 500],           [True, True]),
    ([500, 200],           [True, True]),
    ([200, 500, 200, 200], [True, True, True, False]),
], ids=[
    "un_ok", "ok_repetido", "tres_oks",
    "ok_luego_error", "dos_errores", "recuperacion", "ciclo_completo",
])
def test_state_machine(statuses, expected):
    """El filtro solo suprime OKs consecutivos; errores y recuperaciones loguean."""
    filter_fn = make_health_log_filter()
    results = [
        filter_fn(_make_record(_access_line("GET", "/health", "HTTP/1.1", s)))
        for s in statuses
    ]
    assert results == expected


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — frontera del rango "2xx"
#   199 → justo por debajo de 200 → no es sano  → siempre loguea.
#   200 → límite inferior 2xx      → primera loguea, repetida suprime.
#   299 → límite superior 2xx      → primera loguea, repetida suprime.
#   300 → justo por encima de 299 → no es sano  → siempre loguea.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("status,first,second", [
    (199, True, True),
    (200, True, False),
    (299, True, False),
    (300, True, True),
], ids=["debajo_2xx", "limite_inferior_2xx", "limite_superior_2xx", "encima_2xx"])
def test_status_code_boundaries(status, first, second):
    """Los 2xx consecutivos se suprimen; los no-2xx siempre se loguean."""
    filter_fn = make_health_log_filter()
    r1 = _make_record(_access_line("GET", "/health", "HTTP/1.1", status))
    r2 = _make_record(_access_line("GET", "/health", "HTTP/1.1", status))
    assert filter_fn(r1) is first
    assert filter_fn(r2) is second


# ---------------------------------------------------------------------------
# Casos trampa — la regex solo acepta /health exacto con GET/HEAD.
#   /healthz           → prefijo que empieza por /health pero no es él.
#   /health/detailed   → sub-path bajo /health.
#   /api/health        → /health como sufijo de otra ruta.
#   POST /health       → método no usado por Docker HEALTHCHECK.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("method,path", [
    ("GET",  "/healthz"),
    ("GET",  "/health/detailed"),
    ("GET",  "/api/health"),
    ("POST", "/health"),
], ids=["healthz", "subpath", "prefijo_api", "metodo_post"])
def test_lookalike_requests_are_not_filtered(method, path):
    """Rutas o métodos parecidos a los del sondeo no se suprimen nunca."""
    filter_fn = make_health_log_filter()
    r1 = _make_record(_access_line(method, path, "HTTP/1.1", 200))
    r2 = _make_record(_access_line(method, path, "HTTP/1.1", 200))
    assert filter_fn(r1) is True
    assert filter_fn(r2) is True


# ---------------------------------------------------------------------------
# Caso adversario — una URL con comillas escapadas y "200" incrustado en la
# query string no debe confundirse con un sondeo a /health.
# ---------------------------------------------------------------------------
def test_url_with_embedded_200_does_not_match():
    """Una URL con '200' incrustado en la query no engaña a la regex."""
    filter_fn = make_health_log_filter()
    msg = '127.0.0.1 - "GET /api/items?q=%22+200+hack HTTP/1.1" 500 Internal Server Error'
    r1 = _make_record(msg)
    r2 = _make_record(msg)
    assert filter_fn(r1) is True
    assert filter_fn(r2) is True


# ---------------------------------------------------------------------------
# Integración — install_health_log_filter adjunta el filtro al logger
# "uvicorn.access".
# ---------------------------------------------------------------------------
def test_install_adds_filter_to_uvicorn_access_logger():
    """install_health_log_filter adjunta un filtro al logger uvicorn.access."""
    logger = logging.getLogger("uvicorn.access")
    original_filters = list(logger.filters)
    try:
        install_health_log_filter()
        assert len(logger.filters) == len(original_filters) + 1
    finally:
        logger.filters = original_filters
