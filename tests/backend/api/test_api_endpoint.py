from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

FAKE_OCR_RESULT = [{"text": "Reglas del juego", "confidence": 0.9821}]
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB — debe coincidir con main.py


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------

def _post_image(client, data: bytes, filename: str, mime: str, fmt_param: str = "json"):
    """Envía una petición POST a /api/ocr."""
    return client.post(
        f"/api/ocr?format={fmt_param}",
        files={"image": (filename, data, mime)},
    )


def _mock_ocr_success(result=None):
    """Devuelve un context manager mock de httpx.AsyncClient con respuesta exitosa."""
    if result is None:
        result = FAKE_OCR_RESULT

    mock_response = MagicMock()
    mock_response.json.return_value = {"lines": result}
    mock_response.raise_for_status.return_value = None

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client

    return patch("httpx.AsyncClient", return_value=mock_client)


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
@pytest.mark.parametrize("fixture_name,mime,filename", [
    ("valid_jpeg_bytes", "image/jpeg", "manual.jpg"),
    ("valid_png_bytes",  "image/png",  "manual.png"),
], ids=["jpeg", "png"])
def test_valid_image_formats(client, fixture_name, mime, filename, request):
    """Formato soportado devuelve 200 con las líneas OCR."""
    image_bytes = request.getfixturevalue(fixture_name)
    with _mock_ocr_success():
        response = _post_image(client, image_bytes, filename, mime)
    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — archivos que no son imágenes válidas
#   Clase 3: PDF disfrazado de imagen  -> 415.
#   Clase 4: Binario arbitrario        -> 415.
#   Clase 5: 0 bytes                   -> 415 (PIL no puede abrir un buffer vacio).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("data,filename,mime", [
    (b"%PDF-1.4 fake pdf content",  "doc.pdf",    "application/pdf"),
    (b"\x00\x01\x02\x03\xde\xad",  "binary.bin", "application/octet-stream"),
    (b"",                           "empty.jpg",  "image/jpeg"),
], ids=["pdf", "binario", "vacio"])
def test_invalid_image_content(client, data, filename, mime):
    """Archivo que no sea imagen válida es rechazado con 415."""
    response = _post_image(client, data, filename, mime)
    assert response.status_code == 415


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — tamaño de imagen (límite: 20 MB)
#   19.9 MB -> Válido  (justo por debajo del límite).
#   20.0 MB -> Válido  (exactamente en el límite).
#   20.0 MB + 1 byte -> Inválido, 413 (justo por encima del límite).
#
# Para los casos que deben pasar el chequeo de tamano se mockea PIL y
# httpx, aislando así el test de la lógica de tamaño pura.
# El caso 413 no llega siquiera a PIL, por lo que no necesita mock.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("size,expected_status", [
    (int(19.9 * 1024 * 1024), 200),   # justo por debajo -> aceptado.
    (20 * 1024 * 1024,         200),   # exactamente 20 MB -> aceptado.
    (20 * 1024 * 1024 + 1,     413),   # justo por encima -> rechazado.
], ids=["19.9mb", "20mb_exacto", "20mb_mas_1_byte"])
def test_size_boundary(client, size, expected_status):
    """Imágenes en el límite de 20 MB: <=20 MB pasan, >20 MB 413."""
    data = b"\x00" * size

    if expected_status == 200:
        with patch("api_app.Image.open") as mock_open, _mock_ocr_success():
            mock_img = MagicMock()
            mock_open.return_value.__enter__ = MagicMock(return_value=mock_img)
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            response = _post_image(client, data, "large.jpg", "image/jpeg")
    else:
        response = _post_image(client, data, "large.jpg", "image/jpeg")

    assert response.status_code == expected_status


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — parámetro ?format
#   Clase 6: format=json  -> respuesta JSON con campo "lines".
#   Clase 7: format=text  -> respuesta PlainText con líneas separadas por \n.
#   Clase 8: format=xml   -> 422 (valor no permitido por el regex del endpoint).
#   Clase 9: sin formato  -> usa json por defecto (comportamiento implicito).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("fmt_param,expected_status,check_fn", [
    ("json", 200, lambda r: r.json()["lines"] == FAKE_OCR_RESULT),
    ("text", 200, lambda r: r.text == "Reglas del juego"),
    ("xml",  422, lambda r: True),
], ids=["json", "text", "xml_invalido"])
def test_format_param(client, fmt_param, expected_status, check_fn, valid_jpeg_bytes):
    """?format controla el tipo de respuesta; valor inválido da 422."""
    with _mock_ocr_success():
        response = _post_image(
            client, valid_jpeg_bytes, "img.jpg", "image/jpeg", fmt_param,
        )
    assert response.status_code == expected_status
    assert check_fn(response)


def test_format_default_is_json(client, valid_jpeg_bytes):
    """Sin el parámetro ?format, el endpoint usa json como valor por defecto."""
    with _mock_ocr_success():
        response = client.post(
            "/api/ocr",
            files={"image": ("img.jpg", valid_jpeg_bytes, "image/jpeg")},
        )
    assert response.status_code == 200
    assert "lines" in response.json()


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — comunicación con servicio OCR
#   Clase 10: OCR no alcanzable (ConnectError) -> 502.
#   Clase 11: OCR responde con error HTTP (HTTPStatusError) -> 500.
# ---------------------------------------------------------------------------
def test_ocr_unavailable(client, valid_jpeg_bytes):
    """Si el servicio OCR no es alcanzable, el gateway devuelve 502."""
    mock_client = AsyncMock()
    mock_client.post.side_effect = httpx.ConnectError("connection refused")
    mock_client.__aenter__.return_value = mock_client

    with patch("httpx.AsyncClient", return_value=mock_client):
        response = _post_image(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")
    assert response.status_code == 502


def test_ocr_http_error(client, valid_jpeg_bytes):
    """Si el servicio OCR responde con un error HTTP, el gateway devuelve 500."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Internal Server Error",
        request=MagicMock(),
        response=mock_response,
    )

    mock_client = AsyncMock()
    mock_client.post.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client

    with patch("httpx.AsyncClient", return_value=mock_client):
        response = _post_image(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — petición sin archivo adjunto
#   Clase 12: campo "image" ausente en el multipart -> 422.
# ---------------------------------------------------------------------------
def test_missing_image_field(client):
    """Una petición sin el campo image en el multipart devuelve 422."""
    response = client.post("/api/ocr")
    assert response.status_code == 422
