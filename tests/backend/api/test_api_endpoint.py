import asyncio
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from api.exceptions import ImageTooLargeError, InvalidImageError
from api.service import validate_image

FAKE_OCR_RESULT = [{"text": "Reglas del juego", "confidence": 0.9821}]
MAX_IMAGE_SIZE = 20 * 1024 * 1024


# ---------------------------------------------------------------------------
# Auxiliares.
# ---------------------------------------------------------------------------

def _post_image_json(client, data: bytes, filename: str, mime: str):
    """Envía una petición POST al endpoint JSON ``/api/ocr``."""
    return client.post(
        "/api/ocr",
        files={"image": (filename, data, mime)},
    )


def _post_image_text(client, data: bytes, filename: str, mime: str):
    """Envía una petición POST al endpoint text/plain ``/api/ocr/text``."""
    return client.post(
        "/api/ocr/text",
        files={"image": (filename, data, mime)},
    )


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    """Crea un UploadFile real para probar validaciones internas."""
    return UploadFile(
        file=BytesIO(data),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def _mock_response(payload: dict):
    response = MagicMock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


def _configure_ocr_success(mock_client: AsyncMock, result=None):
    """Configura el mock del cliente HTTP para responder con éxito al OCR."""
    if result is None:
        result = FAKE_OCR_RESULT

    unload_response = _mock_response({"status": "idle", "unloaded": True})
    ocr_response = _mock_response({"lines": result})
    mock_client.post.side_effect = [unload_response, ocr_response]


def _assert_error(response, *, code: str) -> None:
    """Comprueba codigos de error del envelope publico."""
    body = response.json()
    assert any(error["code"] == code for error in body["errors"])


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------

def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
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
def test_valid_image_formats(
    client, fixture_name, mime, filename, request, override_http_client,
):
    """Formato soportado devuelve 200 con las líneas OCR."""
    image_bytes = request.getfixturevalue(fixture_name)
    _configure_ocr_success(override_http_client)

    response = _post_image_json(client, image_bytes, filename, mime)

    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT


def test_ocr_requests_llm_unload_before_ocr(client, valid_jpeg_bytes, override_http_client):
    """Antes de llamar a OCR, el gateway solicita liberar VRAM al servicio LLM."""
    _configure_ocr_success(override_http_client)

    response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 200
    assert override_http_client.post.call_args_list[0].kwargs["url"].endswith(
        "/unload-if-idle"
    )
    assert override_http_client.post.call_args_list[1].kwargs["url"].endswith(
        "/extract"
    )


def test_ocr_continues_when_llm_unload_response_is_not_json(
    client,
    valid_jpeg_bytes,
    override_http_client,
):
    """La liberación previa del LLM es best-effort y no bloquea el OCR."""
    unload_response = _mock_response({"status": "idle"})
    unload_response.json.side_effect = ValueError("invalid json")
    ocr_response = _mock_response({"lines": FAKE_OCR_RESULT})
    override_http_client.post.side_effect = [unload_response, ocr_response]

    response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT
    assert override_http_client.post.call_count == 2


def test_ocr_skips_llm_unload_when_feature_flag_is_disabled(
    client,
    valid_jpeg_bytes,
    override_http_client,
):
    """Si se desactiva la liberación previa, el gateway llama solo al OCR."""
    ocr_response = _mock_response({"lines": FAKE_OCR_RESULT})
    override_http_client.post.return_value = ocr_response

    with patch("api.client.config.LLM_UNLOAD_BEFORE_OCR", False):
        response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 200
    assert response.json()["lines"] == FAKE_OCR_RESULT
    override_http_client.post.assert_awaited_once()
    assert override_http_client.post.call_args.kwargs["url"].endswith("/extract")


def test_ocr_log_sanitizes_uploaded_filename(
    valid_jpeg_bytes,
    override_http_client,
    caplog,
):
    """El nombre del archivo no puede inyectar líneas falsas en el log.

    La capa HTTP de Starlette sanitiza los CRLF en los headers multipart
    antes de que la request llegue al servidor, así que para reproducir un
    filename hostil hay que invocar la lógica de servicio directamente con
    un ``UploadFile`` sintético.
    """
    import logging

    from api.service import extract_ocr_lines

    _configure_ocr_success(override_http_client)
    upload = _upload_file(
        valid_jpeg_bytes,
        "ok.jpg\r\n2025-01-01 [WARNING] FALSO",
        "image/jpeg",
    )

    with caplog.at_level(logging.INFO, logger="api.service"):
        lines = asyncio.run(extract_ocr_lines(image=upload, client=override_http_client))

    assert lines == FAKE_OCR_RESULT
    messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == "api.service" and "Petición OCR recibida" in record.getMessage()
    ]
    assert messages
    assert all("\r" not in message and "\n" not in message for message in messages)
    assert any("ok.jpg??2025-01-01 [WARNING] FALSO" in message for message in messages)


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — archivos que no son imágenes válidas
#   Clase 3: PDF disfrazado de imagen  -> 415.
#   Clase 4: Binario arbitrario        -> 415.
#   Clase 5: 0 bytes                   -> 415 (PIL no puede abrir un buffer vacío).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("data,filename,mime", [
    (b"%PDF-1.4 fake pdf content",  "doc.pdf",    "application/pdf"),
    (b"\x00\x01\x02\x03\xde\xad",  "binary.bin", "application/octet-stream"),
    (b"",                           "empty.jpg",  "image/jpeg"),
], ids=["pdf", "binario", "vacio"])
def test_invalid_image_content(client, data, filename, mime):
    """Archivo que no sea imagen válida es rechazado con 415."""
    response = _post_image_json(client, data, filename, mime)
    assert response.status_code == 415
    _assert_error(response, code="invalid_image")


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — tamaño de imagen (límite: 20 MB)
#   19.9 MB -> Válido  (justo por debajo del límite).
#   20.0 MB -> Válido  (exactamente en el límite).
#   20.0 MB + 1 byte -> Inválido, 413 (justo por encima del límite).
#
# Para los casos que deben pasar el chequeo de tamaño se mockea PIL y el
# cliente HTTP, aislando así el test de la lógica de tamaño pura.
# El caso 413 no llega siquiera a PIL, por lo que no necesita mock.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("size,expected_status", [
    (int(19.9 * 1024 * 1024), 200),   # justo por debajo -> aceptado.
    (20 * 1024 * 1024,         200),   # exacto 20 MB -> aceptado.
    (20 * 1024 * 1024 + 1,     413),   # justo por encima -> rechazado.
], ids=["19.9mb", "20mb_exacto", "20mb_mas_1_byte"])
def test_size_boundary(client, size, expected_status, override_http_client):
    """Imágenes en el límite de 20 MB: <=20 MB pasan, >20 MB 413."""
    data = b"\x00" * size

    if expected_status == 200:
        _configure_ocr_success(override_http_client)
        with patch("api.service.Image.open") as mock_open:
            mock_img = MagicMock()
            mock_open.return_value.__enter__ = MagicMock(return_value=mock_img)
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            response = _post_image_json(client, data, "large.jpg", "image/jpeg")
    else:
        response = _post_image_json(client, data, "large.jpg", "image/jpeg")

    assert response.status_code == expected_status
    if expected_status == 413:
        _assert_error(response, code="image_too_large")


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — endpoints de salida según content-type
#   Clase 6: /api/ocr        -> JSON estructurado con campo "lines".
#   Clase 7: /api/ocr/text   -> text/plain con líneas separadas por "\n".
#   Clase 8: /api/ocr/xml    -> 404 (ruta inexistente; sustituye al antiguo
#                                    "format inválido" de la query param eliminado).
# ---------------------------------------------------------------------------

def test_ocr_json_endpoint_returns_structured_payload(
    client, valid_jpeg_bytes, override_http_client,
):
    """``POST /api/ocr`` devuelve JSON con la lista de líneas OCR."""
    _configure_ocr_success(override_http_client)

    response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["lines"] == FAKE_OCR_RESULT


def test_ocr_text_endpoint_returns_plain_text(
    client, valid_jpeg_bytes, override_http_client,
):
    """``POST /api/ocr/text`` devuelve text/plain con las líneas concatenadas."""
    _configure_ocr_success(override_http_client)

    response = _post_image_text(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.text == "Reglas del juego"


def test_unknown_ocr_subpath_returns_404(client):
    """Cualquier subpath distinto de ``text`` bajo ``/api/ocr/`` no existe."""
    response = client.post(
        "/api/ocr/xml",
        files={"image": ("img.jpg", b"\x00", "image/jpeg")},
    )
    assert response.status_code == 404
    _assert_error(response, code="not_found")


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — comunicación con servicio OCR
#   Clase 9:  OCR no alcanzable (ConnectError) -> 502.
#   Clase 10: OCR responde con error HTTP (HTTPStatusError) -> 500.
# ---------------------------------------------------------------------------
def test_ocr_unavailable(client, valid_jpeg_bytes, override_http_client):
    """Si el servicio OCR no es alcanzable, el gateway devuelve 502."""
    override_http_client.post.side_effect = httpx.ConnectError("connection refused")

    response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 502
    _assert_error(response, code="service_unavailable")


def test_ocr_http_error(client, valid_jpeg_bytes, override_http_client):
    """Si el servicio OCR responde con un error HTTP, el gateway devuelve 500."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Internal Server Error",
        request=MagicMock(),
        response=mock_response,
    )
    override_http_client.post.return_value = mock_response

    response = _post_image_json(client, valid_jpeg_bytes, "img.jpg", "image/jpeg")

    assert response.status_code == 500
    _assert_error(response, code="internal_service_error")


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — petición sin archivo adjunto
#   Clase 11: campo "image" ausente en el multipart -> 422.
# ---------------------------------------------------------------------------
def test_missing_image_field(client):
    """Una petición sin el campo image en el multipart devuelve 422."""
    response = client.post("/api/ocr")
    assert response.status_code == 422


def test_validate_image_raises_domain_error_when_file_is_too_large():
    """La validación interna expresa el exceso de tamaño como error de dominio."""
    upload = _upload_file(b"\x00" * (MAX_IMAGE_SIZE + 1), "large.jpg", "image/jpeg")

    with pytest.raises(ImageTooLargeError):
        asyncio.run(validate_image(upload))


def test_validate_image_raises_domain_error_when_content_is_not_image():
    """La validación interna expresa el contenido inválido como error de dominio."""
    upload = _upload_file(b"not an image", "manual.jpg", "image/jpeg")

    with pytest.raises(InvalidImageError):
        asyncio.run(validate_image(upload))
