from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

import api.client as api_client
from api.exceptions import (
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
)


@pytest.mark.anyio
async def test_post_json_delega_en_send_request(monkeypatch):
    """post_json construye una llamada JSON uniforme hacia servicios internos."""
    send_request_mock = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(api_client, "send_request", send_request_mock)
    client = AsyncMock()

    result = await api_client.post_json(
        client=client,
        service_name="RAG",
        url="http://rag/retrieve",
        payload={"question": "¿Cómo se gana?"},
        unavailable_detail="RAG no disponible.",
        internal_detail="Error RAG.",
    )

    assert result == {"ok": True}
    send_request_mock.assert_awaited_once_with(
        client=client,
        service_name="RAG",
        request_kwargs={
            "url": "http://rag/retrieve",
            "json": {"question": "¿Cómo se gana?"},
            "timeout": api_client.config.INTERNAL_JSON_TIMEOUT,
        },
        unavailable_detail="RAG no disponible.",
        internal_detail="Error RAG.",
    )


@pytest.mark.anyio
async def test_send_request_maps_internal_404_to_domain_error():
    """Un 404 interno conserva el detail del servicio sin exponer HTTPX."""
    response = MagicMock()
    response.status_code = 404
    response.json.return_value = {"detail": "Contexto no encontrado."}
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Not Found",
        request=MagicMock(),
        response=response,
    )
    client = AsyncMock()
    client.post.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Contexto no encontrado."


@pytest.mark.anyio
async def test_send_request_maps_internal_404_without_json_to_default_detail():
    """Un 404 interno con HTML o body vacío no escapa como JSONDecodeError."""
    response = MagicMock()
    response.status_code = 404
    response.json.side_effect = ValueError("not json")
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Not Found",
        request=MagicMock(),
        response=response,
    )
    client = AsyncMock()
    client.post.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Recurso no encontrado."


@pytest.mark.anyio
async def test_send_request_maps_internal_404_with_non_object_json_to_default_detail():
    """Un 404 interno con JSON no objeto usa detail público por defecto."""
    response = MagicMock()
    response.status_code = 404
    response.json.return_value = ["not", "an", "object"]
    response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Not Found",
        request=MagicMock(),
        response=response,
    )
    client = AsyncMock()
    client.post.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Recurso no encontrado."


@pytest.mark.anyio
async def test_send_request_maps_transport_errors_to_unavailable():
    """Timeouts y errores de red no escapan como excepciones de HTTPX."""
    client = AsyncMock()
    client.post.side_effect = httpx.ReadTimeout("timeout")

    with pytest.raises(InternalServiceUnavailableError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/ingest"},
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "RAG no disponible."


@pytest.mark.anyio
async def test_send_request_maps_invalid_json_to_internal_error():
    """Una respuesta 200 no JSON del servicio interno queda como error controlado."""
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.side_effect = ValueError("not json")
    client = AsyncMock()
    client.post.return_value = response

    with pytest.raises(InternalServiceError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/ingest"},
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Error RAG."
