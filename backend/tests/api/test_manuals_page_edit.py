from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

import api.manuals.service as manual_service
from api.auth.dependencies import get_current_auth, require_csrf
from api.auth.service import AuthenticatedSession
from api.main import app
from api.manuals.exceptions import (
    ManualBusyError,
    ManualNotEditableError,
    ManualNotFoundError,
)
from api.manuals.repository import get_page_for_edit, mark_page_chunks_indexed
from api.manuals.schemas import MANUAL_PAGE_TEXT_MAX_LENGTH, ManualPageResponse
from api.manuals.service import PageEditResult, edit_page_text, sync_page_rag
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_MANUAL_ID = UUID("018fd000-0000-7000-8000-000000000041")
_PAGE_ID = UUID("018fd000-0000-7000-8000-000000000042")
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000043")
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_INGEST_RESPONSE = {
    "chunks_indexed": 1,
    "chunk_ids": ["018fd000-0000-7000-8000-000000000044"],
    "embedding_model": "intfloat/multilingual-e5-small",
    "indexed_at": "2026-06-10T10:05:00+00:00",
}


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para el endpoint de edición."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    app.dependency_overrides[require_csrf] = lambda: None
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)
        app.dependency_overrides.pop(require_csrf, None)


def test_edit_page_text_strips_and_returns_updated_page(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Editar una página delega el texto recortado y devuelve su estado nuevo."""
    old_chunk_id = uuid4()
    edit_mock = AsyncMock(return_value=_page_edit_result(stale_chunk_ids=[old_chunk_id]))
    delay_mock = MagicMock()
    monkeypatch.setattr("api.manuals.router.edit_page_text", edit_mock)
    monkeypatch.setattr("api.manuals.router.sync_page_rag_task.delay", delay_mock)

    response = client.put(
        f"/api/manuals/{_MANUAL_ID}/pages/3/text",
        json={"text": "  El ladrón se mueve al sacar un 7.  "},
    )

    assert response.status_code == 200
    assert response.json()["text_source"] == "user_edit"
    edit_mock.assert_awaited_once()
    assert edit_mock.await_args.kwargs["text"] == "El ladrón se mueve al sacar un 7."
    assert edit_mock.await_args.kwargs["page_number"] == 3
    delay_mock.assert_called_once_with(
        str(_MANUAL_ID),
        str(_PAGE_ID),
        [str(old_chunk_id)],
    )


def test_edit_page_text_busy_manual_returns_409(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un manual en procesamiento rechaza la edición con código estable."""
    monkeypatch.setattr(
        "api.manuals.router.edit_page_text",
        AsyncMock(side_effect=ManualBusyError),
    )

    response = client.put(
        f"/api/manuals/{_MANUAL_ID}/pages/1/text",
        json={"text": "Texto corregido"},
    )

    assert response.status_code == 409
    assert any(error["code"] == "manual_busy" for error in response.json()["errors"])


def test_edit_page_text_shared_manual_returns_403(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un manual compartido no se puede editar a mano."""
    monkeypatch.setattr(
        "api.manuals.router.edit_page_text",
        AsyncMock(side_effect=ManualNotEditableError),
    )

    response = client.put(
        f"/api/manuals/{_MANUAL_ID}/pages/1/text",
        json={"text": "Texto corregido"},
    )

    assert response.status_code == 403
    assert any(error["code"] == "manual_not_editable" for error in response.json()["errors"])


def test_edit_page_text_missing_manual_returns_stable_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un manual ajeno responde el mismo 404 que uno inexistente."""
    monkeypatch.setattr(
        "api.manuals.router.edit_page_text",
        AsyncMock(side_effect=ManualNotFoundError),
    )

    response = client.put(
        f"/api/manuals/{_MANUAL_ID}/pages/1/text",
        json={"text": "Texto corregido"},
    )

    assert response.status_code == 404
    assert any(error["code"] == "manual_not_found" for error in response.json()["errors"])


def test_edit_page_text_validates_text_bounds(
    client,
    override_auth_and_db,
):
    """El texto vacío o desmesurado devuelve códigos estables de formulario."""
    blank = client.put(f"/api/manuals/{_MANUAL_ID}/pages/1/text", json={"text": "   "})
    too_long = client.put(
        f"/api/manuals/{_MANUAL_ID}/pages/1/text",
        json={"text": "x" * (MANUAL_PAGE_TEXT_MAX_LENGTH + 1)},
    )
    bad_page = client.put(f"/api/manuals/{_MANUAL_ID}/pages/0/text", json={"text": "ok"})

    assert blank.status_code == 422
    assert blank.json()["errors"][0]["code"] == "text_required"
    assert too_long.status_code == 422
    assert too_long.json()["errors"][0]["code"] == "text_too_long"
    assert bad_page.status_code == 422


def test_edit_page_text_service_replaces_and_returns_sync_payload(monkeypatch):
    """La edición reemplaza la página y devuelve lo necesario para Celery."""
    session = _service_session()
    old_chunk_id = uuid4()
    replace_mock = AsyncMock()
    events: list[str] = []
    _patch_lock(monkeypatch, session)
    monkeypatch.setattr(
        manual_service,
        "get_page_for_edit",
        AsyncMock(return_value=_page_context()),
    )
    monkeypatch.setattr(
        manual_service,
        "list_page_chunk_ids",
        AsyncMock(return_value=[old_chunk_id]),
    )
    monkeypatch.setattr(manual_service, "_replace_page_text", replace_mock)
    monkeypatch.setattr(
        manual_service,
        "get_manual_page_row",
        AsyncMock(return_value=_page_row()),
    )
    monkeypatch.setattr(
        manual_service,
        "record_security_event",
        lambda _session, **kwargs: events.append(kwargs["event_type"]),
    )

    response = anyio.run(
        partial(
            edit_page_text,
            auth=_auth(),
            manual_id=_MANUAL_ID,
            page_number=3,
            text="El ladrón se mueve al sacar un 7.",
            ip_address="203.0.113.7",
        )
    )

    assert isinstance(response, PageEditResult)
    assert response.response.text_source == "user_edit"
    assert response.page_id == _PAGE_ID
    assert response.stale_chunk_ids == [old_chunk_id]
    replace_kwargs = replace_mock.await_args.kwargs
    assert replace_kwargs["text_source"] == "user_edit"
    assert replace_kwargs["confidence_mean"] is None
    assert replace_kwargs["lines"] == [
        {"text": "El ladrón se mueve al sacar un 7.", "confidence": None}
    ]
    assert events == ["manual_page_edited"]
    assert session.commits == 1


def test_edit_page_text_service_rejects_concurrent_processing(monkeypatch):
    """Sin el lock del manual la edición se rechaza sin tocar nada."""

    @asynccontextmanager
    async def busy_lock(_manual_id):
        yield None

    replace_mock = AsyncMock()
    monkeypatch.setattr(manual_service, "manual_lock", busy_lock)
    monkeypatch.setattr(manual_service, "_replace_page_text", replace_mock)

    with pytest.raises(ManualBusyError):
        anyio.run(
            partial(
                edit_page_text,
                auth=_auth(),
                manual_id=_MANUAL_ID,
                page_number=1,
                text="Texto",
                ip_address=None,
            )
        )

    replace_mock.assert_not_called()


def test_edit_page_text_service_rejects_indexing_manual(monkeypatch):
    """Con el manual en estado indexing la edición responde ocupado."""
    session = _service_session()
    _patch_lock(monkeypatch, session)
    monkeypatch.setattr(
        manual_service,
        "get_page_for_edit",
        AsyncMock(return_value=_page_context(status="indexing")),
    )

    with pytest.raises(ManualBusyError):
        anyio.run(
            partial(
                edit_page_text,
                auth=_auth(),
                manual_id=_MANUAL_ID,
                page_number=1,
                text="Texto",
                ip_address=None,
            )
        )


def test_edit_page_text_service_rejects_shared_manual(monkeypatch):
    """La edición queda limitada a manuales privados."""
    session = _service_session()
    replace_mock = AsyncMock()
    _patch_lock(monkeypatch, session)
    monkeypatch.setattr(
        manual_service,
        "get_page_for_edit",
        AsyncMock(return_value=_page_context(visibility="shared")),
    )
    monkeypatch.setattr(manual_service, "_replace_page_text", replace_mock)

    with pytest.raises(ManualNotEditableError):
        anyio.run(
            partial(
                edit_page_text,
                auth=_auth(),
                manual_id=_MANUAL_ID,
                page_number=1,
                text="Texto",
                ip_address=None,
            )
        )

    replace_mock.assert_not_called()


def test_sync_page_rag_cleans_old_chunks_and_ingests_new_ones(monkeypatch):
    """La task de sincronización limpia Chroma e ingesta los chunks vigentes."""
    session = _service_session()
    old_chunk_id = uuid4()
    chunk = SimpleNamespace(
        id=UUID(_INGEST_RESPONSE["chunk_ids"][0]),
        text="El ladrón se mueve al sacar un 7.",
        chunk_index=4,
        source_page=3,
        content_hash="f" * 64,
    )
    delete_mock = AsyncMock()
    ingest_mock = AsyncMock(return_value=_INGEST_RESPONSE)
    mark_mock = AsyncMock()
    _patch_sessionmaker(monkeypatch, session)
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_page_context()),
    )
    monkeypatch.setattr(
        manual_service,
        "list_page_chunks_for_ingest",
        AsyncMock(return_value=[chunk]),
    )
    monkeypatch.setattr(manual_service, "delete_chunks_from_rag", delete_mock)
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", ingest_mock)
    monkeypatch.setattr(manual_service, "mark_page_chunks_indexed", mark_mock)

    anyio.run(partial(sync_page_rag, _MANUAL_ID, _PAGE_ID, [old_chunk_id]))

    assert delete_mock.await_args.kwargs["chunk_ids"] == [old_chunk_id]
    assert ingest_mock.await_args.kwargs["manual"].id == _MANUAL_ID
    assert ingest_mock.await_args.kwargs["chunks"] == [chunk]
    mark_kwargs = mark_mock.await_args.kwargs
    assert mark_kwargs["chunk_ids"] == {UUID(_INGEST_RESPONSE["chunk_ids"][0])}
    assert mark_kwargs["embedding_model"] == _INGEST_RESPONSE["embedding_model"]


def test_sync_page_rag_skips_ingest_for_empty_text(monkeypatch):
    """Si una página queda sin chunks, la task solo limpia y recalcula estado."""
    session = _service_session()
    old_chunk_id = uuid4()
    delete_mock = AsyncMock()
    ingest_mock = AsyncMock()
    mark_mock = AsyncMock()
    _patch_sessionmaker(monkeypatch, session)
    monkeypatch.setattr(
        manual_service,
        "get_manual_for_processing",
        AsyncMock(return_value=_page_context()),
    )
    monkeypatch.setattr(
        manual_service,
        "list_page_chunks_for_ingest",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(manual_service, "delete_chunks_from_rag", delete_mock)
    monkeypatch.setattr(manual_service, "_index_manual_in_rag", ingest_mock)
    monkeypatch.setattr(manual_service, "mark_page_chunks_indexed", mark_mock)

    anyio.run(partial(sync_page_rag, _MANUAL_ID, _PAGE_ID, [old_chunk_id]))

    assert delete_mock.await_args.kwargs["chunk_ids"] == [old_chunk_id]
    ingest_mock.assert_not_called()
    assert mark_mock.await_args.kwargs["chunk_ids"] == set()
    assert mark_mock.await_args.kwargs["indexed_at"] is None


def test_get_page_for_edit_embeds_ownership_in_query():
    """El lookup de página exige dueño, manual vivo y número de página."""

    class FakeResult:
        def one_or_none(self):
            return None

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    with pytest.raises(ManualNotFoundError):
        anyio.run(
            partial(
                get_page_for_edit,
                session,
                owner_user_id=_USER_ID,
                manual_id=_MANUAL_ID,
                page_number=3,
            )
        )

    compiled = _compile(session.statement)
    assert "manuals.owner_user_id =" in compiled
    assert "manuals.deleted_at IS NULL" in compiled
    assert "manual_pages.page_number =" in compiled


def test_mark_page_chunks_indexed_recounts_and_resolves_status(monkeypatch):
    """La sincronización por página recuenta chunks y recalcula el estado."""
    manual = SimpleNamespace(chunks_indexed=0, status="pending_review", indexed_at=None)
    chunk = SimpleNamespace(embedding_model=None, indexed_at=None)
    chunk_id = uuid4()
    indexed_at = datetime(2026, 6, 10, 10, 5, tzinfo=UTC)

    class FakeSession:
        def __init__(self):
            self.commits = 0
            self.calls = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(scalars=lambda: [chunk])
            return SimpleNamespace(scalar_one=lambda: 5)

        async def get(self, _model, _manual_id):
            await anyio.lowlevel.checkpoint()
            return manual

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()
    monkeypatch.setattr(
        "api.manuals.repository.resolve_manual_processed_status",
        AsyncMock(return_value="active"),
    )

    anyio.run(
        partial(
            mark_page_chunks_indexed,
            session,
            manual_id=_MANUAL_ID,
            chunk_ids={chunk_id},
            embedding_model="intfloat/multilingual-e5-small",
            indexed_at=indexed_at,
        )
    )

    assert chunk.embedding_model == "intfloat/multilingual-e5-small"
    assert chunk.indexed_at == indexed_at
    assert manual.chunks_indexed == 5
    assert manual.status == "active"
    assert manual.indexed_at == indexed_at
    assert session.commits == 1


def _patch_lock(monkeypatch, session) -> None:
    """Sustituye el advisory lock por una sesión falsa ya adquirida."""

    @asynccontextmanager
    async def fake_lock(_manual_id):
        yield session

    monkeypatch.setattr(manual_service, "manual_lock", fake_lock)


def _patch_sessionmaker(monkeypatch, session) -> None:
    """Sustituye el sessionmaker real por una sesión falsa en contexto."""

    class FakeSessionContext:
        async def __aenter__(self):
            return session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeSessionmaker:
        def __call__(self):
            return FakeSessionContext()

    monkeypatch.setattr(manual_service, "get_sessionmaker", lambda: FakeSessionmaker())


def _auth() -> AuthenticatedSession:
    """Construye una sesión autenticada mínima para el servicio."""
    return SimpleNamespace(user=SimpleNamespace(id=_USER_ID))


def _auth_session() -> AuthenticatedSession:
    """Construye una sesión autenticada para overrides de FastAPI."""
    return AuthenticatedSession(
        user=User(
            id=_USER_ID,
            email="manualito@example.com",
            username="Manualito",
            username_key="manualito",
            password_hash=_FAKE_HASH,
            role="user",
            status="active",
            created_at=_NOW,
            last_login_at=None,
            password_changed_at=_NOW,
        ),
        auth_session=AuthSession(
            user_id=_USER_ID,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=_NOW + timedelta(days=7),
        ),
        session_token="session-manualito",
        csrf_token="csrf-manualito",
    )


def _service_session() -> SimpleNamespace:
    """Construye una sesión falsa con commit observable."""
    session = SimpleNamespace(commits=0)

    async def commit():
        await anyio.lowlevel.checkpoint()
        session.commits += 1

    session.commit = commit
    session.add = lambda _instance: None
    return session


def _page_context(
    *,
    status: str = "pending_review",
    visibility: str = "private",
) -> SimpleNamespace:
    """Construye el contexto de manual+página que devuelve el repositorio."""
    return SimpleNamespace(
        id=_MANUAL_ID,
        game_id=_GAME_ID,
        owner_user_id=_USER_ID,
        language="es",
        status=status,
        visibility=visibility,
        page_id=_PAGE_ID,
    )


def _page_row(
    *,
    text_quality: str = "ok",
    lines: list[dict] | None = None,
) -> SimpleNamespace:
    """Construye la fila pública de la página tras editarla."""
    default_lines = [{"text": "El ladrón se mueve al sacar un 7.", "confidence": None}]
    return SimpleNamespace(
        page_number=3,
        ocr_status="completed",
        text_source="user_edit",
        text_quality=text_quality,
        dedup_status="none",
        ocr_confidence_mean=None,
        ocr_lines=default_lines if lines is None else lines,
    )


def _page_response() -> ManualPageResponse:
    """Construye la respuesta pública estable de la página editada."""
    return ManualPageResponse.model_validate(_page_row())


def _page_edit_result(*, stale_chunk_ids: list[UUID] | None = None) -> PageEditResult:
    """Construye el resultado interno de editar una página."""
    return PageEditResult(
        response=_page_response(),
        page_id=_PAGE_ID,
        stale_chunk_ids=[] if stale_chunk_ids is None else stale_chunk_ids,
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
