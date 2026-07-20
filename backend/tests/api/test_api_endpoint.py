import pytest


def test_root_banner(client):
    """La raíz muestra una pantalla humana de arranque de la API."""
    response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<pre>" in response.text
    assert 'class="card"' in response.text
    assert 'class="ready"' in response.text
    assert "ready" in response.text
    assert "v1.0.0" in response.text
    assert "/docs" in response.text
    assert "/health" in response.text


def test_openapi_describes_manual_upload_limits(client):
    """OpenAPI publica los límites decimales que aplica la subida de manuales."""
    response = client.get("/openapi.json")

    description = response.json()["paths"]["/api/manuals"]["post"]["responses"]["413"][
        "description"
    ]
    assert description == (
        "Cada imagen admite 30 MB; el PDF o el conjunto admite 95 MB; el manual admite 30 páginas."
    )


def test_openapi_does_not_publish_legacy_ocr_routes(client):
    """La documentación pública no anuncia la antigua fachada OCR síncrona."""
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert all(not path.startswith("/api/ocr") for path in response.json()["paths"])


def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/api/ocr", "/api/ocr/text"])
def test_legacy_public_ocr_routes_return_standard_not_found(client, path):
    """Las rutas OCR retiradas usan el mismo contrato 404 que cualquier ruta inexistente."""
    response = client.post(path)

    assert response.status_code == 404
    assert response.json() == {
        "detail": "Recurso no encontrado.",
        "errors": [
            {
                "field": None,
                "code": "not_found",
                "message": "Recurso no encontrado.",
            }
        ],
    }
