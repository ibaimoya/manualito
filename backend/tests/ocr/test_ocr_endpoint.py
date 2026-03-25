import io
from unittest.mock import patch, MagicMock

import pytest
from PIL import Image

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB — debe coincidir con main.py

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


def _post_image(client, data: bytes, filename: str, mime: str, fmt_param: str = "json"):
    """Envía una petición POST a /api/ocr con los datos de imagen proporcionados."""
    return client.post(
        f"/api/ocr?format={fmt_param}",
        files={"image": (filename, data, mime)},
    )


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------

def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/api/ocr/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — formatos de imagen válidos
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
    with patch("main.extract_text", return_value=FAKE_OCR_RESULT):
        response = _post_image(client, image_bytes, filename, mime)
    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — archivos que no son imágenes válidas
#   Clase 3: PDF disfrazado de imagen  → 415.
#   Clase 4: Binario arbitrario        → 415.
#   Clase 5: 0 bytes                   → 415 (PIL no puede abrir un buffer vacío).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("data,filename,mime", [
    (b"%PDF-1.4 fake pdf content",  "doc.pdf",    "application/pdf"),
    (b"\x00\x01\x02\x03\xde\xad",  "binary.bin", "application/octet-stream"),
    (b"",                           "empty.jpg",  "image/jpeg"),
], ids=["pdf", "binario", "vacio"])
def test_invalid_image_content(client, data, filename, mime):
    """Cualquier archivo que no sea una imagen válida es rechazado con 415."""
    response = _post_image(client, data, filename, mime)
    assert response.status_code == 415


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — tamaño de imagen (límite: 20 MB)
#   19.9 MB → Válido  (justo por debajo del límite).
#   20.0 MB → Válido  (exactamente en el límite).
#   20.0 MB + 1 byte → Inválido, 413 (justo por encima del límite).
#
# Para los casos que deben pasar el chequeo de tamaño se mockea PIL y
# extract_text, aislando así el test de la lógica de tamaño pura.
# El caso 413 no llega siquiera a PIL, por lo que no necesita mock.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("size,expected_status", [
    (int(19.9 * 1024 * 1024), 200),   # justo por debajo → aceptado.
    (20 * 1024 * 1024,         200),   # exactamente 20 MB → aceptado.
    (20 * 1024 * 1024 + 1,     413),   # justo por encima → rechazado.
], ids=["19.9mb", "20mb_exacto", "20mb_mas_1_byte"])
def test_size_boundary(client, size, expected_status):
    """Imágenes en el límite de 20 MB: por debajo y en el límite pasan, por encima devuelven 413."""
    data = b"\x00" * size

    if expected_status == 200:
        # Se mockea PIL para aislar el chequeo de tamaño de la validación
        # de contenido: lo que se prueba aquí es únicamente el límite de bytes.
        with patch("main.Image.open") as mock_open, \
             patch("main.extract_text", return_value=[]):
            mock_open.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            response = _post_image(client, data, "large.jpg", "image/jpeg")
    else:
        response = _post_image(client, data, "large.jpg", "image/jpeg")

    assert response.status_code == expected_status


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — parámetro ?format
#   Clase 6: format=json  → respuesta JSON con campo "lines".
#   Clase 7: format=text  → respuesta PlainText con líneas separadas por \n.
#   Clase 8: format=xml   → 422 (valor no permitido por el regex del endpoint).
#   Clase 9: sin formato  → usa json por defecto (comportamiento implícito).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("fmt_param,expected_status,check_fn", [
    ("json", 200, lambda r: r.json()["lines"] == FAKE_OCR_RESULT),
    ("text", 200, lambda r: r.text == "Reglas del juego"),
    ("xml",  422, lambda r: True),
], ids=["json", "text", "xml_invalido"])
def test_format_param(client, fmt_param, expected_status, check_fn, valid_jpeg_bytes):
    """El parámetro ?format controla el tipo de respuesta; un valor inválido devuelve 422."""
    with patch("main.extract_text", return_value=FAKE_OCR_RESULT):
        response = _post_image(client, valid_jpeg_bytes, "img.jpg", "image/jpeg", fmt_param)
    assert response.status_code == expected_status
    assert check_fn(response)


def test_format_default_is_json(client, valid_jpeg_bytes):
    """Sin el parámetro ?format, el endpoint usa json como valor por defecto."""
    with patch("main.extract_text", return_value=FAKE_OCR_RESULT):
        response = client.post(
            "/api/ocr",
            files={"image": ("img.jpg", valid_jpeg_bytes, "image/jpeg")},
        )
    assert response.status_code == 200
    assert "lines" in response.json()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — fallos del motor OCR
#   Clase 10: extract_text lanza una excepción → 500.
# ---------------------------------------------------------------------------
def test_ocr_engine_error(client, valid_jpeg_bytes):
    """Si el motor OCR lanza una excepción, el endpoint la captura y devuelve 500."""
    with patch("main.extract_text", side_effect=RuntimeError("fallo interno")):
        response = _post_image(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — petición sin archivo adjunto
#   Clase 11: campo "image" ausente en el multipart → 422.
# ---------------------------------------------------------------------------
def test_missing_image_field(client):
    """Una petición sin el campo image en el multipart devuelve 422."""
    response = client.post("/api/ocr")
    assert response.status_code == 422
