import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

import llm_app
import prompt_builder
from llm_app import app, get_http_client


@pytest.fixture
def override_http_client():
    """Inyecta un cliente HTTP simulado sin depender del lifespan real."""
    mock_client = AsyncMock()
    app.dependency_overrides[get_http_client] = lambda: mock_client
    try:
        yield mock_client
    finally:
        app.dependency_overrides.pop(get_http_client, None)


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------

def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — construcción del prompt
#   Clase 1: El contexto cabe completo y se incluyen todos los fragmentos.
#   Clase 2: El presupuesto se agota y los últimos fragmentos se descartan.
# ---------------------------------------------------------------------------
def test_build_prompt_includes_context_and_faithfulness_rule():
    """El prompt final conserva la pregunta y las reglas de respuesta fiel."""
    prompt, included = prompt_builder.build_prompt("¿Cómo se gana?", ["Regla 1", "Regla 2"])

    assert included == 2
    assert "No aparece en el manual." in prompt
    assert "[Fragmento 1]" in prompt
    assert "Regla 2" in prompt
    assert "¿Cómo se gana?" in prompt


def test_build_prompt_truncates_chunks_outside_budget():
    """Solo se incluyen los fragmentos que caben dentro del presupuesto máximo."""
    with patch.object(prompt_builder, "MAX_CONTEXT_CHARS", 35):
        prompt, included = prompt_builder.build_prompt(
            "¿Cómo se gana?",
            ["A" * 12, "B" * 12, "C" * 12],
        )

    assert included == 1
    assert "[Fragmento 1]" in prompt
    assert "AAAAAAAAAAAA" in prompt
    assert "[Fragmento 2]" not in prompt
    assert "BBBBBBBBBBBB" not in prompt


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — dependencias auxiliares del servicio
#   Clase 3: Cliente HTTP inicializado correctamente.
#   Clase 4: Cliente HTTP aún no inicializado — se lanza RuntimeError.
#   Clase 5: El modelo configurado existe en Ollama.
#   Clase 6: El modelo configurado no existe — se registra warning.
#   Clase 7: La verificación inicial falla — se registra warning y continúa.
# ---------------------------------------------------------------------------
def test_get_http_client_raises_without_lifespan():
    """Sin lifespan activo, la dependencia del cliente HTTP falla explícitamente."""
    previous_client = llm_app._http_client
    llm_app._http_client = None
    try:
        with pytest.raises(RuntimeError, match="no se ha inicializado"):
            get_http_client()
    finally:
        llm_app._http_client = previous_client


def test_warn_if_model_missing_logs_info_when_model_exists():
    """Si Ollama anuncia el modelo configurado, se registra un mensaje informativo."""
    client = AsyncMock()
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"models": [{"name": llm_app.OLLAMA_MODEL}]}
    client.get.return_value = response

    with patch.object(llm_app.logger, "info") as mock_info:
        asyncio.run(llm_app._warn_if_model_missing(client))

    mock_info.assert_called_once()


def test_warn_if_model_missing_logs_warning_when_model_is_missing():
    """Si el modelo no está en /api/tags, se registra un warning informativo."""
    client = AsyncMock()
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"models": [{"name": "otro-modelo"}]}
    client.get.return_value = response

    with patch.object(llm_app.logger, "warning") as mock_warning:
        asyncio.run(llm_app._warn_if_model_missing(client))

    mock_warning.assert_called_once()


def test_warn_if_model_missing_tolerates_startup_failures():
    """Si la comprobación inicial falla, el servicio registra warning y sigue."""
    client = AsyncMock()
    client.get.side_effect = httpx.ConnectError("down")

    with patch.object(llm_app.logger, "warning") as mock_warning:
        asyncio.run(llm_app._warn_if_model_missing(client))

    mock_warning.assert_called_once()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — generación de respuesta
#   Clase 8: Ollama devuelve una respuesta válida — 200.
#   Clase 9: Ollama no responde — 502.
#   Clase 10: Ollama agota el timeout — 504.
#   Clase 11: Ollama responde con error HTTP — 500.
#   Clase 12: Ollama devuelve JSON inválido — 502.
#   Clase 13: Ollama devuelve respuesta vacía — 500.
# ---------------------------------------------------------------------------
def test_generate_returns_trimmed_answer(client, override_http_client):
    """La respuesta válida del LLM se limpia y se expone en el campo answer."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"response": "  Respuesta final  "}
    override_http_client.post.return_value = mock_response

    response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": "Respuesta final"}


def test_generate_returns_502_when_ollama_is_unreachable(client, override_http_client):
    """Si no se puede abrir conexión con Ollama, el endpoint devuelve 502."""
    override_http_client.post.side_effect = httpx.ConnectError("down")

    response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Servicio LLM no disponible."}


def test_generate_returns_504_when_ollama_times_out(client, override_http_client):
    """Si Ollama tarda demasiado, el endpoint devuelve 504."""
    override_http_client.post.side_effect = httpx.TimeoutException("slow")

    response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert response.status_code == 504
    assert response.json() == {"detail": "El LLM tardó demasiado en responder."}


def test_generate_returns_500_when_ollama_returns_http_error(client, override_http_client):
    """Los errores HTTP de Ollama se traducen a un 500 controlado."""
    request = httpx.Request("POST", "http://ollama.test/api/generate")
    response = httpx.Response(500, request=request)
    override_http_client.post.side_effect = httpx.HTTPStatusError(
        "boom",
        request=request,
        response=response,
    )

    api_response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert api_response.status_code == 500
    assert api_response.json() == {
        "detail": "Error interno al generar la respuesta con el LLM."
    }


def test_generate_returns_502_when_ollama_returns_invalid_json(client, override_http_client):
    """Una carga no JSON desde Ollama se reporta como respuesta inválida."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.side_effect = ValueError("invalid json")
    override_http_client.post.return_value = mock_response

    response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Respuesta no válida del LLM."}


def test_generate_returns_500_when_ollama_returns_empty_text(client, override_http_client):
    """Una respuesta vacía del LLM se rechaza como salida no válida."""
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"response": "   "}
    override_http_client.post.return_value = mock_response

    response = client.post(
        "/generate",
        json={"question": "¿Cómo se gana?", "context_chunks": ["Regla 1"]},
    )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "El LLM no devolvió una respuesta válida."
    }
