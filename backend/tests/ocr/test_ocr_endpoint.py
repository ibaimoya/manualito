import asyncio
import os
import threading
import time
from io import BytesIO
from unittest.mock import patch

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from ocr.exceptions import OcrProcessingError
from ocr.service import extract_image_text

FAKE_OCR_RESULT = [{"text": "Reglas del juego", "confidence": 0.9821}]


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------

def _post_image(client, data: bytes, filename: str, mime: str):
    """Envía una petición POST a /extract con los datos de imagen proporcionados."""
    return client.post(
        "/extract",
        files={"image": (filename, data, mime)},
    )


def _upload_file(
    data: bytes,
    filename: str = "manual.jpg",
    content_type: str = "image/jpeg",
) -> UploadFile:
    """Crea un UploadFile real para probar la capa interna OCR."""
    return UploadFile(
        file=BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------

def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — formatos de imagen
#   Clase 1: JPEG — formato principal esperado (fotos de manuales).
#   Clase 2: PNG  — formato alternativo igualmente válido.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("fixture_name,mime,filename", [
    ("valid_jpeg_bytes", "image/jpeg", "manual.jpg"),
    ("valid_png_bytes",  "image/png",  "manual.png"),
], ids=["jpeg", "png"])
def test_valid_image_formats(client, fixture_name, mime, filename, request):
    """Formato soportado devuelve 200 con las líneas OCR."""
    image_bytes = request.getfixturevalue(fixture_name)
    with patch("ocr.service.extract_text", return_value=FAKE_OCR_RESULT):
        response = _post_image(client, image_bytes, filename, mime)
    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — fallos del motor OCR
#   Clase 3: extract_text lanza una excepción → 500.
# ---------------------------------------------------------------------------
def test_ocr_engine_error(client, valid_jpeg_bytes):
    """Si el motor OCR lanza una excepción, el endpoint la captura y devuelve 500."""
    with patch("ocr.service.extract_text", side_effect=RuntimeError("fallo interno")):
        response = _post_image(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — petición sin archivo adjunto
#   Clase 4: campo "image" ausente en el multipart → 422.
# ---------------------------------------------------------------------------
def test_missing_image_field(client):
    """Una petición sin el campo image en el multipart devuelve 422."""
    response = client.post("/extract")
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
        response = _post_image(client, valid_jpeg_bytes, "manual.jpg", "image/jpeg")

    assert response.status_code == 200
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_extract_image_text_succeeds_if_engine_removes_temp_file(valid_jpeg_bytes):
    """El cleanup no falla si el motor OCR ya ha eliminado el temporal."""
    captured: list[str] = []
    upload = _upload_file(valid_jpeg_bytes)

    def _capture_and_remove(path):
        captured.append(path)
        os.remove(path)
        return FAKE_OCR_RESULT

    with patch("ocr.service.extract_text", side_effect=_capture_and_remove):
        response = asyncio.run(extract_image_text(upload))

    assert response.model_dump() == {"lines": FAKE_OCR_RESULT}
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_temp_file_cleaned_on_ocr_error(client, valid_jpeg_bytes):
    """Si extract_text lanza, el fichero temporal se borra igualmente."""
    captured: list[str] = []

    def _capture_and_fail(path):
        captured.append(path)
        raise RuntimeError("fallo simulado")

    with patch("ocr.service.extract_text", side_effect=_capture_and_fail):
        response = _post_image(client, valid_jpeg_bytes, "manual.jpg", "image/jpeg")

    assert response.status_code == 500
    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_extract_image_text_raises_domain_error_on_ocr_failure(valid_jpeg_bytes):
    """La capa interna expresa fallos del motor OCR como error de dominio."""
    captured: list[str] = []
    upload = _upload_file(valid_jpeg_bytes)

    def _capture_and_fail(path):
        captured.append(path)
        raise RuntimeError("fallo simulado")

    with (
        patch("ocr.service.extract_text", side_effect=_capture_and_fail),
        pytest.raises(OcrProcessingError),
    ):
        asyncio.run(extract_image_text(upload))

    assert len(captured) == 1
    assert not os.path.exists(captured[0])


def test_extract_image_text_raises_domain_error_on_unexpected_engine_shape(valid_jpeg_bytes):
    """Errores estructurales del engine OCR se convierten en error de dominio."""
    upload = _upload_file(valid_jpeg_bytes)

    with (
        patch("ocr.service.extract_text", side_effect=KeyError("text")),
        pytest.raises(OcrProcessingError),
    ):
        asyncio.run(extract_image_text(upload))


def test_extract_image_text_raises_domain_error_when_temp_file_cannot_be_written(
    valid_jpeg_bytes,
):
    """Si no se puede escribir el temporal, se devuelve un error OCR controlado."""
    upload = _upload_file(valid_jpeg_bytes)

    with (
        patch("ocr.service.anyio.open_file", side_effect=OSError("read-only tmp")),
        pytest.raises(OcrProcessingError),
    ):
        asyncio.run(extract_image_text(upload))


def test_extract_image_text_limits_concurrent_engine_calls(valid_jpeg_bytes):
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

    async def _run_two_uploads():
        await asyncio.gather(
            extract_image_text(_upload_file(valid_jpeg_bytes, filename="a.jpg")),
            extract_image_text(_upload_file(valid_jpeg_bytes, filename="b.jpg")),
        )

    with patch("ocr.service.extract_text", side_effect=_slow_extract):
        asyncio.run(_run_two_uploads())

    assert max_active == 1
