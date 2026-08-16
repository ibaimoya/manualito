from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI, Request

import api.client as api_client
from api.exceptions import (
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
)


@pytest.mark.anyio
async def test_call_ocr_service_streams_raw_image_to_internal_http_boundary(tmp_path):
    """OCR recibe el binario exacto con longitud y MIME, sin envoltorio multipart."""
    image_bytes = b"x" * (2 * 1024 * 1024 + 17)
    image_path = tmp_path / "generated-internal-name.jpg"
    image_path.write_bytes(image_bytes)
    observed: dict[str, object] = {}
    ocr_app = FastAPI()

    @ocr_app.post("/extract")
    async def extract(request: Request):
        observed["headers"] = dict(request.headers)
        chunks = [chunk async for chunk in request.stream() if chunk]
        observed["body"] = b"".join(chunks)
        observed["chunk_sizes"] = [len(chunk) for chunk in chunks]
        return {"lines": [{"text": "Regla", "confidence": 0.9}]}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=ocr_app),
        base_url="http://ocr",
    ) as client:
        result = await api_client.call_ocr_service(
            client=client,
            image_path=image_path,
            byte_size=len(image_bytes),
            content_type="image/jpeg",
        )

    assert result == [{"text": "Regla", "confidence": 0.9}]
    assert observed["body"] == image_bytes
    assert observed["chunk_sizes"] == [1024 * 1024, 1024 * 1024, 17]
    headers = observed["headers"]
    assert isinstance(headers, dict)
    assert headers["content-type"] == "image/jpeg"
    assert headers["content-length"] == str(len(image_bytes))
    assert "content-disposition" not in headers


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
        },
        timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
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
    client.request.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
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
    client.request.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
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
    client.request.return_value = response

    with pytest.raises(InternalResourceNotFoundError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/retrieve"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Recurso no encontrado."


@pytest.mark.anyio
async def test_send_request_maps_transport_errors_to_unavailable():
    """Timeouts y errores de red no escapan como excepciones de HTTPX."""
    client = AsyncMock()
    client.request.side_effect = httpx.ReadTimeout("timeout")

    with pytest.raises(InternalServiceUnavailableError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/ingest"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
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
    client.request.return_value = response

    with pytest.raises(InternalServiceError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/ingest"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Error RAG."


@pytest.mark.anyio
async def test_send_request_maps_non_object_success_json_to_internal_error():
    """Una respuesta 200 con JSON raíz no objeto queda como error controlado."""
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = ["not", "an", "object"]
    client = AsyncMock()
    client.request.return_value = response

    with pytest.raises(InternalServiceError) as exc_info:
        await api_client.send_request(
            client=client,
            service_name="RAG",
            request_kwargs={"url": "http://rag/ingest"},
            timeout_seconds=api_client.config.INTERNAL_JSON_TIMEOUT,
            unavailable_detail="RAG no disponible.",
            internal_detail="Error RAG.",
        )

    assert exc_info.value.detail == "Error RAG."


@pytest.mark.anyio
async def test_call_ocr_service_maps_corrupt_payload_to_internal_error(tmp_path):
    """Un payload OCR sin líneas válidas no llega al postprocesado."""
    image_path = tmp_path / "asset.jpg"
    image_path.write_bytes(b"image")
    ocr_app = FastAPI()

    @ocr_app.post("/extract")
    async def corrupt_extract():
        return {"lines": [{"confidence": 0.9}]}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=ocr_app),
        base_url="http://ocr",
    ) as client:
        with pytest.raises(InternalServiceError) as exc_info:
            await api_client.call_ocr_service(
                client=client,
                image_path=image_path,
                byte_size=5,
                content_type="image/jpeg",
            )

    assert exc_info.value.detail == "Error interno al procesar la imagen con OCR."


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("helper_name", "expected_method"),
    [
        ("get_json", "GET"),
        ("post_json", "POST"),
    ],
    ids=["get-json", "post-json"],
)
async def test_json_helpers_usan_su_metodo_http(
    helper_name: str,
    expected_method: str,
) -> None:
    """Los helpers JSON usan su método HTTP y devuelven el objeto recibido."""
    response = MagicMock(spec=httpx.Response)
    response.raise_for_status.return_value = None
    response.json.return_value = {"method": expected_method}
    client = MagicMock(spec=httpx.AsyncClient)
    client.request = AsyncMock(return_value=response)
    url = "http://internal/resource"

    if helper_name == "get_json":
        result = await api_client.get_json(
            client=client,
            service_name="Interno",
            url=url,
            unavailable_detail="Servicio no disponible.",
            internal_detail="Error interno.",
        )
        expected_request_kwargs: dict[str, object] = {"url": url}
    else:
        payload = {"source": "test"}
        result = await api_client.post_json(
            client=client,
            service_name="Interno",
            url=url,
            payload=payload,
            unavailable_detail="Servicio no disponible.",
            internal_detail="Error interno.",
        )
        expected_request_kwargs = {"url": url, "json": payload}

    assert result == {"method": expected_method}
    client.request.assert_awaited_once_with(expected_method, **expected_request_kwargs)
