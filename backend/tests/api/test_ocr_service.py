from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import anyio
import pytest

from api import config
from api.exceptions import InternalServiceUnavailableError
from api.manuals.dto import ValidatedManualImage
from api.ocr import correction as correction_module
from api.ocr import service as ocr_service

_IMAGE = ValidatedManualImage(
    path=Path("/tmp/pagina.jpg"),
    byte_size=1024,
    mime_type="image/jpeg",
    extension="jpg",
    width=100,
    height=100,
    sha256="0" * 64,
)


def _run_ocr_with(monkeypatch, *, raw_lines, correction_model="gemma4:e4b", llm_replies=None):
    """Ejecuta run_ocr con dobles de prueba y devuelve las líneas y las llamadas al LLM."""
    monkeypatch.setattr(
        ocr_service.internal_client,
        "call_ocr_service",
        AsyncMock(return_value=raw_lines),
    )
    monkeypatch.setattr(config, "OLLAMA_CORRECTION_MODEL", correction_model)
    llm_calls: list[dict[str, object]] = []
    replies = list(llm_replies or [])

    async def fake_post_json(**kwargs):
        await anyio.lowlevel.checkpoint()
        llm_calls.append(dict(kwargs["payload"]))
        reply = replies.pop(0) if replies else {"text": kwargs["payload"]["text"]}
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(correction_module.internal_client, "post_json", fake_post_json)
    lines = anyio.run(lambda: ocr_service.run_ocr(image=_IMAGE, client=SimpleNamespace()))
    return lines, llm_calls


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — pipeline completo de run_ocr
#   EP1: las cuatro zonas de confianza reciben su tratamiento.
#   EP2: sin modelo corrector no hay llamadas al LLM pero si reglas.
#   EP3: un fallo del LLM degrada la linea y corta el resto de la pagina.
# ---------------------------------------------------------------------------


def test_run_ocr_aplica_gate_reglas_y_llm(monkeypatch):
    """Cada zona de confianza descarta, corrige o conserva sus líneas."""
    raw = [
        {"text": "nn. se", "confidence": 0.30},
        {"text": "deben rostarse antes de la", "confidence": 0.60},
        {"text": "e Construir una carretera", "confidence": 0.90},
        {"text": "19 hexágonos", "confidence": 0.92},
    ]

    lines, llm_calls = _run_ocr_with(
        monkeypatch,
        raw_lines=raw,
        llm_replies=[{"text": "deben restarse antes de la"}],
    )

    assert lines == [
        {"text": "deben restarse antes de la", "confidence": 0.60},
        {"text": "Construir una carretera", "confidence": 0.90},
        {"text": "19 hexágonos", "confidence": 0.92},
    ]
    assert len(llm_calls) == 1
    assert llm_calls[0]["text"] == "deben rostarse antes de la"


@pytest.mark.parametrize(
    ("confidence", "expects_llm"),
    [
        (0.49, False),
        (0.50, True),
        (0.84, True),
        (0.85, False),
    ],
)
def test_run_ocr_en_los_limites_del_gate(monkeypatch, confidence, expects_llm):
    """Los umbrales del filtro se respetan de extremo a extremo."""
    raw = [{"text": "una linea de texto normal", "confidence": confidence}]

    lines, llm_calls = _run_ocr_with(monkeypatch, raw_lines=raw)

    assert (len(llm_calls) == 1) is expects_llm
    assert (len(lines) == 1) is (confidence >= 0.50)


def test_run_ocr_sin_modelo_corrector_solo_aplica_reglas(monkeypatch):
    """Las reglas siguen limpiando la página con el corrector desactivado."""
    raw = [
        {"text": "e Construir propie-", "confidence": 0.84},
        {"text": "dades del tablero", "confidence": 0.90},
    ]

    lines, llm_calls = _run_ocr_with(monkeypatch, raw_lines=raw, correction_model="")

    assert llm_calls == []
    assert lines == [
        {"text": "Construir propiedades", "confidence": 0.84},
        {"text": "del tablero", "confidence": 0.90},
    ]


def test_run_ocr_degrada_y_corta_tras_un_fallo_del_llm(monkeypatch):
    """Un fallo del LLM conserva la línea con reglas y omite las llamadas restantes."""
    raw = [
        {"text": "primera linea dudosa", "confidence": 0.60},
        {"text": "segunda linea dudosa", "confidence": 0.60},
        {"text": "tercera linea dudosa", "confidence": 0.60},
    ]

    lines, llm_calls = _run_ocr_with(
        monkeypatch,
        raw_lines=raw,
        llm_replies=[InternalServiceUnavailableError("LLM caído")],
    )

    assert [line["text"] for line in lines] == [
        "primera linea dudosa",
        "segunda linea dudosa",
        "tercera linea dudosa",
    ]
    assert len(llm_calls) == 1


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — ventana de contexto e idioma
#   EP1: ventana ±2 sobre la lista final con BVA en primera y ultima linea.
#   EP2: el idioma detectado de la pagina viaja en el payload.
#   EP3: la respuesta corregida conserva la confianza original.
# ---------------------------------------------------------------------------


def test_run_ocr_monta_la_ventana_de_contexto(monkeypatch):
    """Cada línea de la franja media recibe hasta dos vecinas por lado de la lista final."""
    raw = [
        {"text": "linea uno del manual", "confidence": 0.60},
        {"text": "linea dos del manual", "confidence": 0.90},
        {"text": "linea tres del manual", "confidence": 0.90},
        {"text": "linea cuatro del manual", "confidence": 0.90},
        {"text": "linea cinco del manual", "confidence": 0.60},
    ]

    _lines, llm_calls = _run_ocr_with(monkeypatch, raw_lines=raw)

    assert llm_calls[0]["context_before"] == []
    assert llm_calls[0]["context_after"] == [
        "linea dos del manual",
        "linea tres del manual",
    ]
    assert llm_calls[1]["context_before"] == [
        "linea tres del manual",
        "linea cuatro del manual",
    ]
    assert llm_calls[1]["context_after"] == []


def test_run_ocr_detecta_el_idioma_de_la_pagina(monkeypatch):
    """Una página claramente inglesa solicita la corrección en inglés."""
    raw = [
        {"text": "the players must take turns", "confidence": 0.60},
        {"text": "each player draws a card from the deck", "confidence": 0.90},
    ]

    _lines, llm_calls = _run_ocr_with(monkeypatch, raw_lines=raw)

    assert llm_calls[0]["language"] == "en"


def test_run_ocr_conserva_la_confianza_al_corregir(monkeypatch):
    """La línea corregida conserva su confianza y solo cambia el texto."""
    raw = [{"text": "el jugadar naranja gana", "confidence": 0.7}]

    lines, _llm_calls = _run_ocr_with(
        monkeypatch,
        raw_lines=raw,
        llm_replies=[{"text": "el jugador naranja gana"}],
    )

    assert lines == [{"text": "el jugador naranja gana", "confidence": 0.7}]


def test_run_ocr_ignora_respuestas_sin_texto_valido(monkeypatch):
    """Una respuesta sin texto válido conserva la línea original."""
    raw = [{"text": "linea dudosa del manual", "confidence": 0.7}]

    lines, _llm_calls = _run_ocr_with(
        monkeypatch,
        raw_lines=raw,
        llm_replies=[{"otra_clave": 1}],
    )

    assert lines == [{"text": "linea dudosa del manual", "confidence": 0.7}]
