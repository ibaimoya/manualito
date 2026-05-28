from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx


def _mock_response(payload: dict):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def test_create_manual_orquesta_ocr_e_ingesta(client, valid_jpeg_bytes, override_http_client):
    unload_response = _mock_response({"status": "idle", "unloaded": True})
    ocr_lines = [{"text": "Regla 1", "confidence": 0.9}]
    ocr_response = _mock_response({"lines": ocr_lines})
    rag_response = _mock_response(
        {"manual_id": "catan-12345678", "chunks_indexed": 1, "status": "indexed"}
    )
    override_http_client.post.side_effect = [unload_response, ocr_response, rag_response]

    with patch("api.service.uuid4", return_value=SimpleNamespace(hex="12345678abcdef00")):
        response = client.post(
            "/api/manuals",
            data={"name": "Catan"},
            files={"image": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    # El gateway propaga las líneas OCR junto a la respuesta de RAG para que
    # el cliente pueda mostrar la fuente del texto sin volver a OCR.
    assert response.json() == {
        "manual_id": "catan-12345678",
        "chunks_indexed": 1,
        "status": "indexed",
        "ocr_lines": ocr_lines,
    }


def test_create_manual_propaga_lineas_ocr_con_confidence(
    client, valid_jpeg_bytes, override_http_client,
):
    """``ocr_lines`` mantiene el orden y confidence reportados por el OCR."""
    unload_response = _mock_response({"status": "idle", "unloaded": True})
    ocr_lines = [
        {"text": "Línea legible", "confidence": 0.95},
        {"text": "Línea media", "confidence": 0.72},
        {"text": "Línea borrosa", "confidence": 0.31},
    ]
    ocr_response = _mock_response({"lines": ocr_lines})
    rag_response = _mock_response(
        {"manual_id": "wingspan-abcd1234", "chunks_indexed": 3, "status": "indexed"},
    )
    override_http_client.post.side_effect = [unload_response, ocr_response, rag_response]

    response = client.post(
        "/api/manuals",
        data={"name": "Wingspan"},
        files={"image": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ocr_lines"] == ocr_lines
    # Orden y confidence preservados → necesarios para colorear el viewer.
    assert [line["confidence"] for line in body["ocr_lines"]] == [0.95, 0.72, 0.31]


def test_create_manual_acepta_ocr_vacio(
    client, valid_jpeg_bytes, override_http_client,
):
    """Si el OCR no encuentra texto, ``ocr_lines`` es lista vacía válida."""
    unload_response = _mock_response({"status": "idle", "unloaded": True})
    ocr_response = _mock_response({"lines": []})
    rag_response = _mock_response(
        {"manual_id": "vacio-deadbeef", "chunks_indexed": 0, "status": "indexed"},
    )
    override_http_client.post.side_effect = [unload_response, ocr_response, rag_response]

    response = client.post(
        "/api/manuals",
        data={"name": "Vacío"},
        files={"image": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ocr_lines"] == []
    assert body["chunks_indexed"] == 0


def test_question_manual_devuelve_respuesta_limpia(client, override_http_client):
    rag_response = _mock_response(
        {"chunks": [{"text": "Ganas con 10 puntos", "chunk_index": 0, "score": 0.99}]}
    )
    llm_response = _mock_response({"answer": "Se gana con 10 puntos de victoria."})
    override_http_client.post.side_effect = [rag_response, llm_response]

    response = client.post(
        "/api/manuals/catan-12345678/questions",
        json={"question": "Como se gana?"},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": "Se gana con 10 puntos de victoria."}


def test_question_manual_inexistente_devuelve_404(client, override_http_client):
    missing_response = MagicMock()
    missing_response.status_code = 404
    missing_response.json.return_value = {"detail": "Manual no encontrado."}
    missing_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Not Found",
        request=MagicMock(),
        response=missing_response,
    )
    override_http_client.post.return_value = missing_response

    response = client.post(
        "/api/manuals/manual-missing/questions",
        json={"question": "Como se gana?"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Manual no encontrado."}


def test_question_manual_devuelve_502_si_llm_no_esta_disponible(client, override_http_client):
    rag_response = _mock_response(
        {"chunks": [{"text": "Ganas con 10 puntos", "chunk_index": 0, "score": 0.99}]}
    )
    override_http_client.post.side_effect = [rag_response, httpx.ConnectError("down")]

    response = client.post(
        "/api/manuals/catan-12345678/questions",
        json={"question": "Como se gana?"},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Servicio LLM no disponible."}


def test_question_manual_devuelve_500_si_llm_responde_timeout_http(
    client, override_http_client,
):
    rag_response = _mock_response(
        {"chunks": [{"text": "Ganas con 10 puntos", "chunk_index": 0, "score": 0.99}]}
    )
    timeout_response = MagicMock()
    timeout_response.status_code = 504
    timeout_response.json.return_value = {"detail": "El LLM tardó demasiado en responder."}
    timeout_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Gateway Timeout",
        request=MagicMock(),
        response=timeout_response,
    )
    override_http_client.post.side_effect = [rag_response, timeout_response]

    response = client.post(
        "/api/manuals/catan-12345678/questions",
        json={"question": "Como se gana?"},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Error interno al generar la respuesta."}
