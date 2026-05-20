import logging
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Comprobación de estado.
# ---------------------------------------------------------------------------
def test_health(client):
    """El endpoint de health devuelve 200 y el cuerpo {"status": "ok"}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — ingesta de manuales
#   Clase 1: Texto libre válido — indexación correcta.
#   Clase 2: Líneas OCR válidas — indexación correcta.
#   Clase 3: Texto no indexable tras normalizar — 422.
#   Clase 4: No se pueden generar chunks — 422.
#   Clase 5: Falla la vectorización o la persistencia — 500.
# ---------------------------------------------------------------------------
def test_ingest_indexes_chunks(client):
    """Una ingesta válida devuelve el manual indexado y su número de chunks."""
    embedding_service = MagicMock()
    embedding_service.embed_passages.return_value = [[0.1, 0.2]]
    repository = MagicMock()
    repository.upsert_manual.return_value = 1

    with (
        patch("rag_app.chunk_text", return_value=["Regla uno. Regla dos."]),
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/ingest",
            json={"manual_id": "manual-1", "text": "Regla uno. Regla dos."},
        )

    assert response.status_code == 200
    assert response.json() == {
        "manual_id": "manual-1",
        "chunks_indexed": 1,
        "status": "indexed",
    }
    embedding_service.embed_passages.assert_called_once()
    repository.upsert_manual.assert_called_once()


def test_ingest_indexes_ocr_lines(client):
    """Las líneas OCR se normalizan e indexan igual que el texto libre."""
    embedding_service = MagicMock()
    embedding_service.embed_passages.return_value = [[0.1, 0.2], [0.3, 0.4]]
    repository = MagicMock()
    repository.upsert_manual.return_value = 2

    with (
        patch("rag_app.chunk_text", return_value=["Turno inicial", "Fin de ronda"]),
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/ingest",
            json={
                "manual_id": "manual-ocr",
                "ocr_lines": [
                    {"text": " Turno   inicial ", "confidence": 0.98},
                    {"text": "Fin   de ronda", "confidence": 0.87},
                ],
                "source_page": 7,
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "manual_id": "manual-ocr",
        "chunks_indexed": 2,
        "status": "indexed",
    }
    embedding_service.embed_passages.assert_called_once_with(
        ["Turno inicial", "Fin de ronda"]
    )
    repository.upsert_manual.assert_called_once_with(
        manual_id="manual-ocr",
        chunks=["Turno inicial", "Fin de ronda"],
        embeddings=[[0.1, 0.2], [0.3, 0.4]],
        source_page=7,
    )


def test_ingest_returns_422_when_document_has_no_indexable_text(client):
    """Si tras normalizar no queda texto útil, la API devuelve 422."""
    response = client.post(
        "/ingest",
        json={"manual_id": "manual-vacio", "text": "   \n \r\n   "},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "El documento no contiene texto indexable."}


def test_ingest_returns_422_when_chunking_produces_no_chunks(client):
    """Si el chunking no produce fragmentos, la API rechaza la ingesta."""
    with patch("rag_app.chunk_text", return_value=[]):
        response = client.post(
            "/ingest",
            json={"manual_id": "manual-1", "text": "Regla uno."},
        )

    assert response.status_code == 422
    assert response.json() == {"detail": "No se pudieron generar chunks del documento."}


def test_ingest_returns_500_when_indexing_fails(client):
    """Los errores inesperados en embeddings o repositorio se traducen a 500."""
    embedding_service = MagicMock()
    embedding_service.embed_passages.side_effect = RuntimeError("fallo de embeddings")

    with (
        patch("rag_app.chunk_text", return_value=["Regla uno"]),
        patch("rag_app.get_embedding_service", return_value=embedding_service),
    ):
        response = client.post(
            "/ingest",
            json={"manual_id": "manual-1", "text": "Regla uno."},
        )

    assert response.status_code == 500
    assert response.json() == {"detail": "Error interno al indexar el manual."}


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — recuperación de contexto
#   Clase 6: Manual existente — devuelve chunks relevantes.
#   Clase 7: Manual inexistente — 404.
#   Clase 8: Falla inesperada del repositorio — 500.
# ---------------------------------------------------------------------------
def test_retrieve_returns_chunks(client):
    """La recuperación válida devuelve los chunks y respeta el top_k por defecto."""
    repository = MagicMock()
    repository.query_manual.return_value = [
        {
            "id": "manual-1:0",
            "text": "Regla uno",
            "chunk_index": 0,
            "source_page": 1,
            "score": 0.99,
        }
    ]
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"manual_id": "manual-1", "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 200
    assert response.json()["chunks"][0]["chunk_index"] == 0
    repository.query_manual.assert_called_once_with(
        manual_id="manual-1",
        query_embedding=[0.3, 0.4],
        top_k=3,
    )


def test_retrieve_passes_custom_top_k(client):
    """Si el cliente pide otro top_k, ese valor se pasa al repositorio."""
    repository = MagicMock()
    repository.query_manual.return_value = []
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"manual_id": "manual-1", "question": "¿Cómo se gana?", "top_k": 5},
        )

    assert response.status_code == 200
    assert response.json() == {"chunks": []}
    repository.query_manual.assert_called_once_with(
        manual_id="manual-1",
        query_embedding=[0.3, 0.4],
        top_k=5,
    )


def test_retrieve_returns_404_for_missing_manual(client):
    """Si el manual no existe en la base vectorial, el endpoint devuelve 404."""
    from repository import ManualNotFoundError

    repository = MagicMock()
    repository.query_manual.side_effect = ManualNotFoundError("manual-missing")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"manual_id": "manual-missing", "question": "¿Algo?"},
        )

    assert response.status_code == 404
    assert response.json() == {"detail": "Manual no encontrado."}


def test_retrieve_returns_500_when_query_fails(client):
    """Un error inesperado durante la búsqueda se traduce a 500."""
    repository = MagicMock()
    repository.query_manual.side_effect = RuntimeError("fallo en chroma")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
    ):
        response = client.post(
            "/retrieve",
            json={"manual_id": "manual-1", "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 500
    assert response.json() == {
        "detail": "Error interno al recuperar el contexto del manual."
    }


def test_retrieve_error_log_sanitizes_manual_id(client, caplog):
    """El manual_id recibido no puede partir el log en varias líneas."""
    manual_id = "manual\r\n2025-01-01 [ERROR] FALSO"
    repository = MagicMock()
    repository.query_manual.side_effect = RuntimeError("fallo en chroma")
    embedding_service = MagicMock()
    embedding_service.embed_query.return_value = [0.3, 0.4]

    with (
        patch("rag_app.get_embedding_service", return_value=embedding_service),
        patch("rag_app.get_repository", return_value=repository),
        caplog.at_level(logging.ERROR, logger="rag_app"),
    ):
        response = client.post(
            "/retrieve",
            json={"manual_id": manual_id, "question": "¿Cómo se gana?"},
        )

    assert response.status_code == 500
    messages = [
        record.getMessage()
        for record in caplog.records
        if (
            record.name == "rag_app"
            and "Error al recuperar contexto" in record.getMessage()
        )
    ]
    assert messages
    assert all("\r" not in message and "\n" not in message for message in messages)
    assert any("manual??2025-01-01 [ERROR] FALSO" in message for message in messages)
