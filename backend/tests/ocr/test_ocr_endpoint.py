import asyncio
import os
import tempfile
import threading
import time
from unittest.mock import patch

import anyio
import httpx
import pytest
from starlette.requests import Request

from ocr.main import app
from ocr.service import extract_image_text

FAKE_OCR_RESULT = [{"text": "Reglas del juego", "confidence": 0.9821}]


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------


def _post_image(client, data: bytes, mime: str):
    """Envía el cuerpo binario interno con sus cabeceras obligatorias."""
    return client.post(
        "/extract",
        content=data,
        headers={
            "Content-Type": mime,
            "Content-Length": str(len(data)),
        },
    )


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------


def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_extract_accepts_raw_binary_image_contract(client, valid_jpeg_bytes):
    """El endpoint interno consume el binario directamente, sin multipart."""
    with patch("ocr.service.extract_text", return_value=FAKE_OCR_RESULT):
        response = client.post(
            "/extract",
            content=valid_jpeg_bytes,
            headers={
                "Content-Type": "image/jpeg",
                "Content-Length": str(len(valid_jpeg_bytes)),
            },
        )

    assert response.status_code == 200
    assert response.json() == {"lines": FAKE_OCR_RESULT}


def test_extract_rejects_declared_image_above_decimal_limit(client):
    """El límite interno es 30.000.000 bytes y se comprueba antes del OCR."""
    response = client.post(
        "/extract",
        content=b"body-is-not-consumed",
        headers={
            "Content-Type": "image/jpeg",
            "Content-Length": "30000001",
        },
    )

    assert response.status_code == 413
    assert response.json() == {
        "detail": "La imagen no puede superar 30 MB.",
    }


@pytest.mark.anyio
async def test_extract_accepts_exact_decimal_limit(valid_jpeg_bytes):
    """El byte 30.000.000 sigue perteneciendo a la partición válida."""

    async def boundary_body():
        chunk = b"x" * 1_000_000
        for _ in range(29):
            yield chunk
        yield valid_jpeg_bytes + b"x" * (1_000_000 - len(valid_jpeg_bytes))

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://ocr",
    ) as client:
        with patch("ocr.service.extract_text", return_value=FAKE_OCR_RESULT):
            response = await client.post(
                "/extract",
                content=boundary_body(),
                headers={
                    "Content-Type": "image/jpeg",
                    "Content-Length": "30000000",
                },
            )

    assert response.status_code == 200
    assert response.json() == {"lines": FAKE_OCR_RESULT}


@pytest.mark.anyio
async def test_extract_recounts_stream_and_rejects_body_above_decimal_limit():
    """Un Content-Length falso no permite transmitir más de 30.000.000 bytes."""

    async def oversized_body():
        chunk = b"x" * 1_000_000
        for _ in range(30):
            yield chunk
        yield b"x"

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://ocr",
    ) as client:
        response = await client.post(
            "/extract",
            content=oversized_body(),
            headers={
                "Content-Type": "image/jpeg",
                "Content-Length": "30000000",
            },
        )

    assert response.status_code == 413
    assert response.json() == {
        "detail": "La imagen no puede superar 30 MB.",
    }


def test_extract_rejects_body_that_does_not_match_declared_length(client):
    """OCR no procesa un cuerpo truncado respecto a su Content-Length."""
    response = client.post(
        "/extract",
        content=b"x",
        headers={
            "Content-Type": "image/jpeg",
            "Content-Length": "2",
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "El tamaño recibido no coincide con Content-Length.",
    }


def test_extract_rejects_non_image_content_type(client):
    """El contrato interno no vuelve a aceptar envoltorios multipart."""
    response = client.post(
        "/extract",
        content=b"multipart-wrapper",
        headers={
            "Content-Type": "multipart/form-data; boundary=legacy",
            "Content-Length": "17",
        },
    )

    assert response.status_code == 415
    assert response.json() == {
        "detail": "Content-Type de imagen no soportado.",
    }


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — formatos de imagen
#   Clase 1: JPEG — formato principal esperado (fotos de manuales).
#   Clase 2: PNG  — formato alternativo igualmente válido.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "fixture_name,mime",
    [
        ("valid_jpeg_bytes", "image/jpeg"),
        ("valid_png_bytes", "image/png"),
    ],
    ids=["jpeg", "png"],
)
def test_valid_image_formats(client, fixture_name, mime, request):
    """Formato soportado devuelve 200 con las líneas OCR."""
    image_bytes = request.getfixturevalue(fixture_name)
    with patch("ocr.service.extract_text", return_value=FAKE_OCR_RESULT):
        response = _post_image(client, image_bytes, mime)
    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — fallos del motor OCR
#   Clase 3: extract_text lanza una excepción → 500.
# ---------------------------------------------------------------------------
def test_ocr_engine_error(client, valid_jpeg_bytes):
    """Si el motor OCR lanza una excepción, el endpoint la captura y devuelve 500."""
    with patch("ocr.service.extract_text", side_effect=RuntimeError("fallo interno")):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — cabeceras del cuerpo binario
#   Clase 4: falta Content-Type o Content-Length → 422.
# ---------------------------------------------------------------------------
def test_extract_requires_content_type(client):
    """El contrato binario rechaza una petición sin Content-Type."""
    response = client.post(
        "/extract",
        content=b"x",
        headers={"Content-Length": "1"},
    )
    assert response.status_code == 422


def test_extract_requires_content_length(client):
    """El contrato binario rechaza streaming sin Content-Length."""
    response = client.post(
        "/extract",
        content=iter([b"x"]),
        headers={"Content-Type": "image/jpeg"},
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Limpieza del fichero temporal
#   El endpoint persiste la imagen en /tmp para que PaddleOCR la lea por
#   ruta de fichero. El fichero debe borrarse siempre, tanto en éxito como
#   cuando el motor OCR falla, para no acumular basura en disco.
# ---------------------------------------------------------------------------
def test_temp_file_cleaned_on_success(client, valid_jpeg_bytes):
    """Tras una extracción correcta, el fichero temporal se borra."""
    captured: list[str] = []

    def _capture(path):
        captured.append(path)
        return FAKE_OCR_RESULT

    with patch("ocr.service.extract_text", side_effect=_capture):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 200
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_extract_succeeds_if_engine_removes_temp_file(client, valid_jpeg_bytes):
    """El cleanup no falla si el motor OCR ya ha eliminado el temporal."""
    captured: list[str] = []

    def _capture_and_remove(path):
        captured.append(path)
        os.remove(path)
        return FAKE_OCR_RESULT

    with patch("ocr.service.extract_text", side_effect=_capture_and_remove):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 200
    assert response.json() == {"lines": FAKE_OCR_RESULT}
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_temp_file_cleaned_on_ocr_error(client, valid_jpeg_bytes):
    """Si extract_text lanza, el fichero temporal se borra igualmente."""
    captured: list[str] = []

    def _capture_and_fail(path):
        captured.append(path)
        raise RuntimeError("fallo simulado")

    with patch("ocr.service.extract_text", side_effect=_capture_and_fail):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 500
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


@pytest.mark.anyio
async def test_temp_file_cleaned_when_request_is_cancelled(tmp_path, monkeypatch):
    """Cancelar durante el streaming no deja el temporal en disco."""
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    body_read_started = anyio.Event()

    async def receive():
        body_read_started.set()
        await anyio.sleep_forever()

    request = Request({"type": "http"}, receive=receive)

    async def extract() -> None:
        await extract_image_text(
            request,
            content_type="image/jpeg",
            declared_size=1,
        )

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(extract)
        await body_read_started.wait()
        task_group.cancel_scope.cancel()

    assert list(tmp_path.iterdir()) == []


def test_extract_maps_unexpected_engine_shape_to_500(client, valid_jpeg_bytes):
    """Errores estructurales del engine OCR se convierten en error de dominio."""
    with patch("ocr.service.extract_text", side_effect=KeyError("text")):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 500


def test_extract_maps_temp_write_error_to_500(
    client,
    valid_jpeg_bytes,
):
    """Si no se puede escribir el temporal, se devuelve un error OCR controlado."""
    with patch("ocr.service.anyio.open_file", side_effect=OSError("read-only tmp")):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 500


def test_extract_maps_temp_creation_error_to_500(client, valid_jpeg_bytes):
    """Un filesystem temporal no disponible se traduce al error OCR estable."""
    with patch("ocr.service._new_temp_path", side_effect=OSError("read-only tmp")):
        response = _post_image(client, valid_jpeg_bytes, "image/jpeg")

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Error interno al procesar la imagen con OCR.",
    }


@pytest.mark.anyio
async def test_extract_limits_concurrent_engine_calls(valid_jpeg_bytes):
    """El servicio no ejecuta varias extracciones pesadas a la vez por proceso."""
    active = 0
    max_active = 0
    lock = threading.Lock()

    def _slow_extract(_path):
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
        time.sleep(0.05)
        with lock:
            active -= 1
        return FAKE_OCR_RESULT

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://ocr",
    ) as client:
        with patch("ocr.service.extract_text", side_effect=_slow_extract):
            responses = await asyncio.gather(
                client.post(
                    "/extract",
                    content=valid_jpeg_bytes,
                    headers={
                        "Content-Type": "image/jpeg",
                        "Content-Length": str(len(valid_jpeg_bytes)),
                    },
                ),
                client.post(
                    "/extract",
                    content=valid_jpeg_bytes,
                    headers={
                        "Content-Type": "image/jpeg",
                        "Content-Length": str(len(valid_jpeg_bytes)),
                    },
                ),
            )

    assert [response.status_code for response in responses] == [200, 200]
    assert max_active == 1


@pytest.mark.anyio
async def test_extract_limits_concurrent_spooling_before_ocr(valid_jpeg_bytes):
    """El mismo cupo protege tmpfs durante la ingestión, no solo el motor."""
    active_streams = 0
    max_active_streams = 0

    async def slow_body():
        nonlocal active_streams, max_active_streams
        active_streams += 1
        max_active_streams = max(max_active_streams, active_streams)
        try:
            await asyncio.sleep(0.05)
            yield valid_jpeg_bytes
        finally:
            active_streams -= 1

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://ocr",
    ) as client:
        with patch("ocr.service.extract_text", return_value=FAKE_OCR_RESULT):
            responses = await asyncio.gather(
                client.post(
                    "/extract",
                    content=slow_body(),
                    headers={
                        "Content-Type": "image/jpeg",
                        "Content-Length": str(len(valid_jpeg_bytes)),
                    },
                ),
                client.post(
                    "/extract",
                    content=slow_body(),
                    headers={
                        "Content-Type": "image/jpeg",
                        "Content-Length": str(len(valid_jpeg_bytes)),
                    },
                ),
            )

    assert [response.status_code for response in responses] == [200, 200]
    assert max_active_streams == 1
