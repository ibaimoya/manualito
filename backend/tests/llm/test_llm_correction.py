import asyncio
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from llm import client as llm_client
from llm import config
from llm.dependencies import get_http_client
from llm.main import app
from llm.prompt_builder import CORRECTION_PROMPT_VARIANTS, build_correction_messages

_CORRECTION_MODEL = "gemma4:e4b"


@pytest.fixture
def ollama_correction(monkeypatch):
    """Activa el modelo corrector y captura las llamadas a chat de Ollama."""
    monkeypatch.setattr(config, "OLLAMA_CORRECTION_MODEL", _CORRECTION_MODEL)
    calls: list[dict[str, object]] = []
    replies: list[object] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/chat"
        calls.append(json.loads(request.content))
        reply = replies[min(len(calls) - 1, len(replies) - 1)]
        if isinstance(reply, httpx.Response):
            return reply
        if isinstance(reply, Exception):
            raise reply
        return httpx.Response(200, json={"message": {"role": "assistant", "content": reply}})

    transport_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    app.dependency_overrides[get_http_client] = lambda: transport_client
    try:
        yield calls, replies
    finally:
        app.dependency_overrides.pop(get_http_client, None)
        asyncio.run(transport_client.aclose())


@pytest.fixture
def api() -> TestClient:
    return TestClient(app)


@pytest.fixture
def dummy_http_client():
    """Sustituye la dependencia del cliente HTTP para probar sin red ni Ollama."""
    app.dependency_overrides[get_http_client] = lambda: None
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_http_client, None)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — camino feliz del endpoint /correct-line
#   EP1: tres pasadas de chat con el modelo corrector y opciones congeladas.
#   EP2: el consenso 2-de-3 decide la respuesta final.
#   EP3: el candado de digitos frena la correccion numerica unanime.
# ---------------------------------------------------------------------------


def test_correct_line_hace_tres_pasadas_con_opciones_congeladas(api, ollama_correction):
    """Cada pasada usa el modelo corrector con el razonamiento desactivado."""
    calls, replies = ollama_correction
    replies.append("el jugador tira los dados")

    response = api.post(
        "/correct-line",
        json={"text": "el jugadar tira los dados", "context_before": ["linea previa"]},
    )

    assert response.status_code == 200
    assert len(calls) == 3
    prompts = set()
    for call in calls:
        assert call["model"] == _CORRECTION_MODEL
        assert call["stream"] is False
        assert call["think"] is False
        assert call["options"]["temperature"] == 0.2
        assert call["options"]["num_predict"] == 220
        assert call["options"]["num_ctx"] == config.OLLAMA_NUM_CTX
        prompts.add(call["messages"][0]["content"])
    assert len(prompts) == 3


def test_correct_line_aplica_el_consenso_de_mayoria(api, ollama_correction):
    """Dos candidatos coincidentes ganan al tercero discrepante."""
    _calls, replies = ollama_correction
    replies.extend(
        [
            "el jugador tira los dados",
            "el jugador tira los dados",
            "el jugadar tira los dedos",
        ]
    )

    response = api.post("/correct-line", json={"text": "el jugadar tira los dados"})

    assert response.status_code == 200
    assert response.json() == {"text": "el jugador tira los dados"}


def test_correct_line_respeta_el_candado_de_digitos(api, ollama_correction):
    """Un cambio unánime de números devuelve la línea original."""
    _calls, replies = ollama_correction
    replies.append("coge 8 cartas del mazo")

    response = api.post("/correct-line", json={"text": "coge 3 cartas del mazo"})

    assert response.status_code == 200
    assert response.json() == {"text": "coge 3 cartas del mazo"}


def test_correct_line_solo_usa_la_primera_linea_de_cada_candidato(api, ollama_correction):
    """El texto extra tras un salto de línea del modelo se ignora."""
    _calls, replies = ollama_correction
    replies.append("el jugador tira\nExplicación que sobra")

    response = api.post("/correct-line", json={"text": "el jugadar tira"})

    assert response.status_code == 200
    assert response.json() == {"text": "el jugador tira"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — errores del endpoint
#   EP1: sin modelo corrector configurado responde 503.
#   EP2: fallos de Ollama se traducen al contrato HTTP existente.
#   EP3: una pasada vacia responde 500.
# ---------------------------------------------------------------------------


def test_correct_line_sin_modelo_configurado(api, dummy_http_client, monkeypatch):
    """Sin modelo corrector el endpoint responde 503 sin llamar a Ollama."""
    monkeypatch.setattr(config, "OLLAMA_CORRECTION_MODEL", None)

    response = api.post("/correct-line", json={"text": "una linea cualquiera"})

    assert response.status_code == 503


@pytest.mark.parametrize(
    ("reply", "expected_status"),
    [
        (httpx.ConnectError("sin conexion"), 502),
        (httpx.ReadTimeout("agotado"), 504),
        (httpx.Response(500, json={"error": "boom"}), 500),
        (httpx.Response(200, content=b"no es json"), 502),
        ("", 500),
    ],
)
def test_correct_line_traduce_los_fallos_de_ollama(api, ollama_correction, reply, expected_status):
    """El endpoint devuelve el estado HTTP documentado para cada fallo de Ollama."""
    _calls, replies = ollama_correction
    replies.append(reply)

    response = api.post("/correct-line", json={"text": "una linea con fallo"})

    assert response.status_code == expected_status


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — validacion del contrato
#   Texto vacio y contexto de 3 lineas quedan fuera del contrato.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "payload",
    [
        {"text": ""},
        {"text": "linea", "context_before": ["a", "b", "c"]},
        {"text": "linea", "context_after": ["a", "b", "c"]},
        {"text": "linea", "modelo": "extra"},
    ],
)
def test_correct_line_rechaza_payloads_invalidos(api, dummy_http_client, payload):
    """El contrato estricto rechaza texto vacío, contexto demasiado largo y campos extra."""
    assert api.post("/correct-line", json=payload).status_code == 422


def test_correct_line_acepta_el_contexto_maximo(api, ollama_correction):
    """Se admiten hasta dos líneas de contexto por lado."""
    _calls, replies = ollama_correction
    replies.append("linea correcta")

    response = api.post(
        "/correct-line",
        json={
            "text": "linea correcta",
            "context_before": ["una", "dos"],
            "context_after": ["tres", "cuatro"],
        },
    )

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — prompts y payload de control del modelo
#   EP1: el prompt renderizado en espanol es el literal validado.
#   EP2: el contexto vacio usa el marcador neutro.
#   EP3: el override de modelo gana al modelo del chat.
# ---------------------------------------------------------------------------


def test_prompt_espanol_es_el_literal_de_la_competicion():
    """La primera variante renderiza exactamente el prompt validado."""
    messages = build_correction_messages(
        variant=CORRECTION_PROMPT_VARIANTS[0],
        text="19 hexágonos",
        context_before=["linea anterior"],
        context_after=["linea posterior"],
        language="es",
    )

    assert messages == [
        {
            "role": "user",
            "content": (
                "Fix the OCR errors in one line from a Spanish board game manual.\n"
                "Return ONLY the corrected line, no quotes, no explanation.\n"
                "Do not add or remove content, only fix misread characters.\n\n"
                "Neighboring lines (context):\n"
                "linea anterior\nlinea posterior\n\n"
                "Line to fix:\n19 hexágonos\n\nCorrected line:"
            ),
        }
    ]


def test_prompt_sin_contexto_usa_marcador_neutro():
    """Sin líneas vecinas, el hueco de contexto lleva el marcador neutro."""
    messages = build_correction_messages(
        variant=CORRECTION_PROMPT_VARIANTS[0],
        text="linea sola",
        context_before=[],
        context_after=[],
        language="es",
    )

    assert "(no additional context)" in messages[0]["content"]


def test_model_control_payload_admite_override():
    """El modelo indicado tiene prioridad y, si falta, se conserva el modelo del chat."""
    assert llm_client.model_control_payload()["model"] == config.OLLAMA_MODEL
    assert llm_client.model_control_payload(model="gemma4:e4b")["model"] == "gemma4:e4b"


def test_arranque_avisa_si_falta_el_modelo_corrector(monkeypatch, caplog):
    """El arranque registra un aviso si el corrector no está en Ollama."""
    monkeypatch.setattr(config, "OLLAMA_CORRECTION_MODEL", "gemma4:e4b")
    monkeypatch.setattr(config, "OLLAMA_PRELOAD_ON_STARTUP", False)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"models": [{"name": config.OLLAMA_MODEL}]})

    transport_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with caplog.at_level(logging.WARNING, logger="llm.client"):
        asyncio.run(llm_client.prepare_model_on_startup(transport_client))
    asyncio.run(transport_client.aclose())

    assert any("corrector" in message for message in caplog.messages)
