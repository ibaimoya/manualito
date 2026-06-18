from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.service import AuthenticatedSession
from api.exceptions import InternalServiceUnavailableError
from api.games.dependencies import valid_game_form_id, valid_game_id
from api.main import app
from api.manuals.exceptions import (
    GameNotFoundError,
    ManualContextNotFoundError,
    ManualNotFoundError,
)
from api.manuals.repository import ManualDetailRow
from api.manuals.schemas import AnswerResponse, ManualCreatedResponse
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_HASH = "hash-value"
_FAKE_SESSION_HASH = "a" * 64
_FAKE_CSRF_HASH = "b" * 64
_FAKE_SESSION_TOKEN = "session-manualito"
_FAKE_CSRF_TOKEN = "csrf-manualito"
_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = uuid4()
_MANUAL_ID = uuid4()
_OCR_LINES = [{"text": "Regla 1", "confidence": 0.9}]


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión falsas para endpoints autenticados."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    app.dependency_overrides[valid_game_form_id] = lambda: _GAME_ID
    app.dependency_overrides[valid_game_id] = lambda: _GAME_ID
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)
        app.dependency_overrides.pop(valid_game_form_id, None)
        app.dependency_overrides.pop(valid_game_id, None)


def test_create_manual_orquesta_servicio_persistente(
    client,
    valid_jpeg_bytes,
    monkeypatch,
    override_auth_and_db,
):
    """La ruta delega la subida en el caso de uso de manuales persistidos."""
    create_manual_mock = AsyncMock(
        return_value=ManualCreatedResponse(
            manual_id=_MANUAL_ID,
            game_id=_GAME_ID,
            status="indexing",
            visibility="shared",
            source_type="images",
            page_count=1,
        )
    )
    delay_mock = MagicMock()
    monkeypatch.setattr("api.manuals.router.create_manual", create_manual_mock)
    monkeypatch.setattr("api.manuals.router.process_manual_task.delay", delay_mock)

    response = client.post(
        "/api/manuals",
        data={
            "game_id": str(_GAME_ID),
            "title": "Manual base",
            "visibility": "shared",
            "language": "es",
        },
        files=[("images", ("manual.jpg", valid_jpeg_bytes, "image/jpeg"))],
    )

    assert response.status_code == 202
    assert response.json() == {
        "manual_id": str(_MANUAL_ID),
        "game_id": str(_GAME_ID),
        "status": "indexing",
        "visibility": "shared",
        "source_type": "images",
        "page_count": 1,
    }
    create_manual_mock.assert_awaited_once()
    kwargs = create_manual_mock.await_args.kwargs
    assert create_manual_mock.await_args.args == (_FAKE_SESSION,)
    assert kwargs["auth"].user.id == _USER_ID
    assert kwargs["game_id"] == _GAME_ID
    assert kwargs["title"] == "Manual base"
    assert kwargs["visibility"] == "shared"
    assert kwargs["language"] == "es"
    assert kwargs["images"][0].filename == "manual.jpg"
    assert kwargs["pdf"] is None
    delay_mock.assert_called_once_with(str(_MANUAL_ID))


def test_list_manuals_devuelve_manuales_propios(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El listado expone summaries seguros para la biblioteca del usuario."""
    list_mock = AsyncMock(return_value=[_manual_summary()])
    monkeypatch.setattr("api.manuals.router.list_user_manuals", list_mock)

    response = client.get("/api/manuals")

    assert response.status_code == 200
    assert response.json() == {
        "manuals": [
            {
                "id": str(_MANUAL_ID),
                "game_id": str(_GAME_ID),
                "game_name": "Catan",
                "title": "Manual base",
                "status": "active",
                "visibility": "private",
                "source_type": "images",
                "page_count": 1,
                "duplicate_page_count": 0,
                "language": "es",
                "chunks_indexed": 1,
                "created_at": "2026-05-31T10:00:00Z",
                "indexed_at": "2026-05-31T10:00:00Z",
            }
        ]
    }
    list_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        owner_user_id=_USER_ID,
        limit=50,
        offset=0,
    )


def test_list_manuals_respeta_paginacion(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El listado acota la query con limit y offset recibidos."""
    list_mock = AsyncMock(return_value=[])
    monkeypatch.setattr("api.manuals.router.list_user_manuals", list_mock)

    response = client.get("/api/manuals", params={"limit": 10, "offset": 20})

    assert response.status_code == 200
    assert response.json() == {"manuals": []}
    list_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        owner_user_id=_USER_ID,
        limit=10,
        offset=20,
    )


def test_get_manual_devuelve_detalle_con_paginas(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El detalle incluye las páginas OCR sin exponer storage interno."""
    detail = ManualDetailRow(
        summary=_manual_summary(),
        pages=[
            SimpleNamespace(
                page_number=1,
                ocr_status="completed",
                text_source="ocr",
                text_quality="ok",
                dedup_status="none",
                image_available=True,
                image_width=800,
                image_height=1200,
                ocr_confidence_mean=0.9,
                ocr_lines=_OCR_LINES,
            )
        ],
    )
    get_mock = AsyncMock(return_value=detail)
    monkeypatch.setattr("api.manuals.router.get_user_manual_detail", get_mock)

    response = client.get(f"/api/manuals/{_MANUAL_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(_MANUAL_ID)
    assert body["source_type"] == "images"
    assert body["page_count"] == 1
    assert body["pages"] == [
        {
            "page_number": 1,
            "ocr_status": "completed",
            "text_source": "ocr",
            "text_quality": "ok",
            "dedup_status": "none",
            "image_available": True,
            "image_width": 800,
            "image_height": 1200,
            "ocr_confidence_mean": 0.9,
            "ocr_lines": _OCR_LINES,
        }
    ]
    get_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        owner_user_id=_USER_ID,
        manual_id=_MANUAL_ID,
    )


def test_get_manual_processing_devuelve_estado_ligero(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El progreso no arrastra las líneas OCR completas."""
    manual = SimpleNamespace(id=_MANUAL_ID, status="indexing", page_count=2)
    pages = [
        SimpleNamespace(
            page_number=1, ocr_status="completed", text_quality="ok", dedup_status="reused"
        ),
        SimpleNamespace(page_number=2, ocr_status="failed", text_quality=None, dedup_status="none"),
    ]
    get_mock = AsyncMock(return_value=(manual, pages))
    monkeypatch.setattr("api.manuals.router.get_user_manual_processing_status", get_mock)

    response = client.get(f"/api/manuals/{_MANUAL_ID}/processing")

    assert response.status_code == 200
    assert response.json() == {
        "manual_id": str(_MANUAL_ID),
        "status": "indexing",
        "page_count": 2,
        "completed_pages": 1,
        "failed_pages": 1,
        "pages": [
            {
                "page_number": 1,
                "ocr_status": "completed",
                "text_quality": "ok",
                "dedup_status": "reused",
            },
            {
                "page_number": 2,
                "ocr_status": "failed",
                "text_quality": None,
                "dedup_status": "none",
            },
        ],
    }
    get_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        owner_user_id=_USER_ID,
        manual_id=_MANUAL_ID,
    )


def test_get_manual_page_image_devuelve_fichero_privado(
    client,
    tmp_path,
    monkeypatch,
    override_auth_and_db,
):
    """El visor carga la imagen de una página propia sin exponer storage_key."""
    storage_key = "manuals/user/manual/page-1.jpg"
    image_path = tmp_path / storage_key
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"image-bytes")
    monkeypatch.setattr("api.assets.storage.config.ASSET_STORAGE_DIR", str(tmp_path))
    get_mock = AsyncMock(
        return_value=SimpleNamespace(
            storage_key=storage_key,
            mime_type="image/jpeg",
            byte_size=11,
            sha256="a" * 64,
            width=800,
            height=1200,
        )
    )
    monkeypatch.setattr("api.manuals.router.get_user_manual_page_image_asset", get_mock)

    response = client.get(f"/api/manuals/{_MANUAL_ID}/pages/1/image")

    assert response.status_code == 200
    assert response.content == b"image-bytes"
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["cache-control"] == "private, max-age=300, must-revalidate"
    assert response.headers["content-disposition"].startswith("inline;")
    get_mock.assert_awaited_once_with(
        _FAKE_SESSION,
        owner_user_id=_USER_ID,
        manual_id=_MANUAL_ID,
        page_number=1,
    )


def test_get_manual_page_image_sin_asset_devuelve_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Una página sin imagen disponible usa el mismo 404 que un manual inexistente."""
    monkeypatch.setattr(
        "api.manuals.router.get_user_manual_page_image_asset",
        AsyncMock(return_value=None),
    )

    response = client.get(f"/api/manuals/{_MANUAL_ID}/pages/1/image")

    assert response.status_code == 404
    _assert_error(response.json(), code="manual_not_found")


def test_create_manual_usa_visibilidad_privada_por_defecto(
    client,
    valid_jpeg_bytes,
    monkeypatch,
    override_auth_and_db,
):
    """Si el formulario no indica visibilidad, el manual nace privado."""
    create_manual_mock = AsyncMock(
        return_value=ManualCreatedResponse(
            manual_id=_MANUAL_ID,
            game_id=_GAME_ID,
            status="indexing",
            visibility="private",
            source_type="images",
            page_count=1,
        )
    )
    monkeypatch.setattr("api.manuals.router.create_manual", create_manual_mock)
    monkeypatch.setattr("api.manuals.router.process_manual_task.delay", MagicMock())

    response = client.post(
        "/api/manuals",
        data={"game_id": str(_GAME_ID)},
        files=[("images", ("manual.jpg", valid_jpeg_bytes, "image/jpeg"))],
    )

    assert response.status_code == 202
    assert create_manual_mock.await_args.kwargs["visibility"] == "private"


def test_create_manual_devuelve_404_si_el_juego_no_existe(
    client,
    valid_jpeg_bytes,
    monkeypatch,
    override_auth_and_db,
):
    """Un juego inexistente se traduce a error estable para la UI."""
    monkeypatch.setattr(
        "api.manuals.router.create_manual",
        AsyncMock(side_effect=GameNotFoundError),
    )

    response = client.post(
        "/api/manuals",
        data={"game_id": str(_GAME_ID)},
        files=[("images", ("manual.jpg", valid_jpeg_bytes, "image/jpeg"))],
    )

    assert response.status_code == 404
    _assert_error(response.json(), code="game_not_found")


def test_get_manual_ajeno_o_borrado_devuelve_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El endpoint no revela si el manual existe para otro usuario."""
    monkeypatch.setattr(
        "api.manuals.router.get_user_manual_detail",
        AsyncMock(side_effect=ManualNotFoundError),
    )

    response = client.get(f"/api/manuals/{_MANUAL_ID}")

    assert response.status_code == 404
    _assert_error(response.json(), code="manual_not_found")


def test_delete_manual_borra_recursos_derivados(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El endpoint de borrado delega y encola la limpieza de RAG."""
    chunk_id = uuid4()
    delete_mock = AsyncMock(return_value=[chunk_id])
    delay_mock = MagicMock()
    monkeypatch.setattr("api.manuals.router.delete_manual", delete_mock)
    monkeypatch.setattr("api.manuals.router.delete_chunks_from_rag_task.delay", delay_mock)

    response = client.delete(f"/api/manuals/{_MANUAL_ID}")

    assert response.status_code == 204
    assert response.content == b""
    delete_mock.assert_awaited_once()
    delay_mock.assert_called_once_with(str(_MANUAL_ID), [str(chunk_id)])


def test_delete_manual_ajeno_o_borrado_devuelve_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Borrar un manual no propio usa el mismo error que uno inexistente."""
    monkeypatch.setattr(
        "api.manuals.router.delete_manual",
        AsyncMock(side_effect=ManualNotFoundError),
    )

    response = client.delete(f"/api/manuals/{_MANUAL_ID}")

    assert response.status_code == 404
    _assert_error(response.json(), code="manual_not_found")


def test_question_game_devuelve_respuesta_limpia(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Las preguntas van contra el pool autorizado de manuales del juego."""
    answer_mock = AsyncMock(return_value=AnswerResponse(answer="Se gana con 10 puntos."))
    monkeypatch.setattr("api.games.router.generate_game_answer", answer_mock)

    response = client.post(
        f"/api/games/{_GAME_ID}/questions",
        json={"question": "¿Cómo se gana?"},
    )

    assert response.status_code == 200
    assert response.json() == {"answer": "Se gana con 10 puntos.", "sources": []}
    answer_mock.assert_awaited_once()
    kwargs = answer_mock.await_args.kwargs
    assert answer_mock.await_args.args == (_FAKE_SESSION,)
    assert kwargs["current_user_id"] == _USER_ID
    assert kwargs["game_id"] == _GAME_ID
    assert kwargs["question"] == "¿Cómo se gana?"
    assert kwargs["top_k"] == 3


def test_question_game_sin_contexto_autorizado_devuelve_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Si no hay chunks autorizados, la ruta devuelve un código estable."""
    monkeypatch.setattr(
        "api.games.router.generate_game_answer",
        AsyncMock(side_effect=ManualContextNotFoundError),
    )

    response = client.post(
        f"/api/games/{_GAME_ID}/questions",
        json={"question": "¿Cómo se gana?"},
    )

    assert response.status_code == 404
    _assert_error(response.json(), code="manual_context_not_found")


def test_question_game_devuelve_502_si_llm_no_esta_disponible(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El fallo de servicio interno conserva el envelope común de API."""
    monkeypatch.setattr(
        "api.games.router.generate_game_answer",
        AsyncMock(side_effect=InternalServiceUnavailableError("Servicio LLM no disponible.")),
    )

    response = client.post(
        f"/api/games/{_GAME_ID}/questions",
        json={"question": "¿Cómo se gana?"},
    )

    assert response.status_code == 502
    _assert_error(response.json(), code="service_unavailable")


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=_user(),
        auth_session=AuthSession(
            user_id=_USER_ID,
            token_hash=_FAKE_SESSION_HASH,
            csrf_token_hash=_FAKE_CSRF_HASH,
            expires_at=datetime(2026, 5, 29, tzinfo=UTC) + timedelta(days=7),
        ),
        session_token=_FAKE_SESSION_TOKEN,
        csrf_token=_FAKE_CSRF_TOKEN,
    )


def _user() -> User:
    """Crea un usuario ORM mínimo para rutas autenticadas."""
    return User(
        id=_USER_ID,
        email="manualito@example.com",
        username="Manualito",
        username_key="manualito",
        password_hash=_FAKE_HASH,
        role="user",
        status="active",
        created_at=datetime(2026, 5, 29, tzinfo=UTC),
        last_login_at=None,
        password_changed_at=datetime(2026, 5, 29, tzinfo=UTC),
    )


def _manual_summary() -> SimpleNamespace:
    """Construye un resumen estable para respuestas de manuales."""
    timestamp = datetime(2026, 5, 31, 10, 0, tzinfo=UTC)
    return SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        game_name="Catan",
        title="Manual base",
        status="active",
        visibility="private",
        source_type="images",
        page_count=1,
        language="es",
        chunks_indexed=1,
        created_at=timestamp,
        indexed_at=timestamp,
    )


def _assert_error(body: dict, *, code: str) -> None:
    """Comprueba un error público sin depender del texto visible."""
    assert "detail" in body
    assert any(error["field"] is None and error["code"] == code for error in body["errors"])
