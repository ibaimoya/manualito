from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx


def _mock_response(payload: dict):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    return response


def test_create_manual_orquesta_ocr_e_ingesta(client, valid_jpeg_bytes, override_http_client):
    ocr_response = _mock_response({"lines": [{"text": "Regla 1", "confidence": 0.9}]})
    rag_response = _mock_response(
        {"manual_id": "catan-12345678", "chunks_indexed": 1, "status": "indexed"}
    )
    override_http_client.post.side_effect = [ocr_response, rag_response]

    with patch("api_app.uuid4", return_value=SimpleNamespace(hex="12345678abcdef00")):
        response = client.post(
            "/api/manuals",
            data={"name": "Catan"},
            files={"image": ("manual.jpg", valid_jpeg_bytes, "image/jpeg")},
        )

    assert response.status_code == 200
    assert response.json() == {
        "manual_id": "catan-12345678",
        "chunks_indexed": 1,
        "status": "indexed",
    }


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
