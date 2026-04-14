import io
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

FAKE_OCR_RESULT = [{"text": "Reglas del juego", "confidence": 0.9821}]


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------

def _make_image_bytes(fmt: str) -> bytes:
    """Genera bytes de una imagen mínima válida (10x10 px) en el formato indicado."""
    image = Image.new("RGB", (10, 10), color=(100, 150, 200))
    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def _post_image(client, data: bytes, filename: str, mime: str):
    """Envía una petición POST a /extract con los datos de imagen proporcionados."""
    return client.post(
        "/extract",
        files={"image": (filename, data, mime)},
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
@pytest.mark.parametrize("fmt,mime,filename", [
    ("JPEG", "image/jpeg", "manual.jpg"),
    ("PNG",  "image/png",  "manual.png"),
], ids=["jpeg", "png"])
def test_valid_image_formats(client, fmt, mime, filename):
    """Una imagen válida en cualquier formato soportado devuelve 200 con las líneas OCR."""
    image_bytes = _make_image_bytes(fmt)
    with patch("ocr_app.extract_text", return_value=FAKE_OCR_RESULT):
        response = _post_image(client, image_bytes, filename, mime)
    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — fallos del motor OCR
#   Clase 3: extract_text lanza una excepción → 500.
# ---------------------------------------------------------------------------
def test_ocr_engine_error(client, valid_jpeg_bytes):
    """Si el motor OCR lanza una excepción, el endpoint la captura y devuelve 500."""
    with patch("ocr_app.extract_text", side_effect=RuntimeError("fallo interno")):
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
