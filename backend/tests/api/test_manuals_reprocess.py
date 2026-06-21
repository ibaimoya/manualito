from collections.abc import Iterator
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
from api.manuals.exceptions import ManualBusyError, ManualNotFoundError
from api.manuals.repository import begin_manual_reprocessing
from api.manuals.service import reprocess_manual, run_reprocess
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_MANUAL_ID = UUID("018fd000-0000-7000-8000-000000000051")
_PAGE_ID = UUID("018fd000-0000-7000-8000-000000000052")
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para los endpoints de reprocesado."""

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


def test_reprocess_manual_returns_202_with_polling_state(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Reprocesar acepta el trabajo y devuelve el estado para el polling."""
    stale_ids = [uuid4()]
    reprocess_mock = AsyncMock(return_value=stale_ids)
    delay_mock = MagicMock()
    monkeypatch.setattr("api.manuals.router.reprocess_manual", reprocess_mock)
    monkeypatch.setattr("api.manuals.router.reprocess_manual_task.delay", delay_mock)
    monkeypatch.setattr(
        "api.manuals.router.get_user_manual_processing_status",
        AsyncMock(return_value=_processing_rows()),
    )

    response = client.post(f"/api/manuals/{_MANUAL_ID}/reprocess")

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "indexing"
    assert body["completed_pages"] == 0
    reprocess_mock.assert_awaited_once()
    assert reprocess_mock.await_args.kwargs["page_number"] is None
    delay_mock.assert_called_once_with(str(_MANUAL_ID), [str(stale_ids[0])])


def test_reprocess_single_page_passes_page_number(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """La variante por página acota el trabajo a esa página."""
    reprocess_mock = AsyncMock(return_value=[])
    monkeypatch.setattr("api.manuals.router.reprocess_manual", reprocess_mock)
    monkeypatch.setattr("api.manuals.router.reprocess_manual_task.delay", MagicMock())
    monkeypatch.setattr(
        "api.manuals.router.get_user_manual_processing_status",
        AsyncMock(return_value=_processing_rows()),
    )

    response = client.post(f"/api/manuals/{_MANUAL_ID}/pages/2/reprocess")

    assert response.status_code == 202
    assert reprocess_mock.await_args.kwargs["page_number"] == 2


def test_reprocess_busy_manual_returns_409(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un manual ya en indexing rechaza el segundo reprocesado."""
    monkeypatch.setattr(
        "api.manuals.router.reprocess_manual",
        AsyncMock(side_effect=ManualBusyError),
    )

    response = client.post(f"/api/manuals/{_MANUAL_ID}/reprocess")

    assert response.status_code == 409
    assert any(error["code"] == "manual_busy" for error in response.json()["errors"])


def test_reprocess_missing_manual_returns_stable_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Un manual ajeno responde el mismo 404 que uno inexistente."""
    monkeypatch.setattr(
        "api.manuals.router.reprocess_manual",
        AsyncMock(side_effect=ManualNotFoundError),
    )

    response = client.post(f"/api/manuals/{_MANUAL_ID}/reprocess")

    assert response.status_code == 404
    assert any(error["code"] == "manual_not_found" for error in response.json()["errors"])


def test_reprocess_is_rate_limited(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Reprocesar es caro (OCR + embeddings) y tiene freno agresivo."""
    monkeypatch.setattr("api.manuals.router.reprocess_manual", AsyncMock(return_value=[]))
    monkeypatch.setattr("api.manuals.router.reprocess_manual_task.delay", MagicMock())
    monkeypatch.setattr(
        "api.manuals.router.get_user_manual_processing_status",
        AsyncMock(return_value=_processing_rows()),
    )

    responses = [client.post(f"/api/manuals/{_MANUAL_ID}/reprocess") for _index in range(6)]

    assert responses[-1].status_code == 429


def test_reprocess_service_claims_and_schedules_pipeline(monkeypatch):
    """El servicio reclama el manual y devuelve los chunks que limpiará Celery."""
    stale_ids = [uuid4(), uuid4()]
    begin_mock = AsyncMock(return_value=stale_ids)
    monkeypatch.setattr(manual_service, "begin_manual_reprocessing", begin_mock)

    result = anyio.run(
        partial(
            reprocess_manual,
            _FAKE_SESSION,
            auth=SimpleNamespace(user=SimpleNamespace(id=_USER_ID)),
            manual_id=_MANUAL_ID,
            page_number=None,
        )
    )

    assert begin_mock.await_args.kwargs["owner_user_id"] == _USER_ID
    assert result == stale_ids


def test_reprocess_cleans_stale_chunks_before_pipeline(monkeypatch):
    """La tarea borra los chunks obsoletos de Chroma y relanza el pipeline."""
    order: list[str] = []
    page_id = uuid4()
    delete_mock = AsyncMock(side_effect=lambda **_kwargs: order.append("delete"))
    process_mock = AsyncMock(side_effect=lambda _manual_id: order.append("process") or [page_id])
    monkeypatch.setattr(manual_service, "delete_chunks_from_rag", delete_mock)
    monkeypatch.setattr(manual_service, "process_manual", process_mock)

    stale_ids = [uuid4()]
    result = anyio.run(partial(run_reprocess, _MANUAL_ID, stale_ids))

    assert result == [page_id]
    assert order == ["delete", "process"]
    assert delete_mock.await_args.kwargs["chunk_ids"] == stale_ids
    process_mock.assert_awaited_once_with(_MANUAL_ID)


def test_begin_reprocessing_claim_is_a_conditional_update():
    """La transición condicional de estado es la barrera anti-carrera."""
    statements = []

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            statements.append(statement)
            if len(statements) == 1:
                return SimpleNamespace(scalar_one_or_none=lambda: _MANUAL_ID)
            if len(statements) == 2:
                return SimpleNamespace(rowcount=3)
            return SimpleNamespace(scalars=lambda: [uuid4()])

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    stale = anyio.run(
        partial(
            begin_manual_reprocessing,
            session,
            owner_user_id=_USER_ID,
            manual_id=_MANUAL_ID,
            page_number=None,
        )
    )

    assert len(stale) == 1
    assert session.commits == 1
    claim = _compile(statements[0])
    assert "UPDATE manuals" in claim
    assert "manuals.status IN" in claim
    assert "manuals.owner_user_id =" in claim
    assert "RETURNING manuals.id" in claim
    pages_reset = _compile(statements[1])
    assert "UPDATE manual_pages" in pages_reset
    assert "manual_pages.page_number" not in pages_reset
    assert "source_reused_from_page_id" in pages_reset


def test_begin_reprocessing_busy_when_already_indexing():
    """Si otro reprocesado ganó la carrera, este recibe ocupado sin escribir."""

    class FakeSession:
        def __init__(self):
            self.calls = 0
            self.rollbacks = 0
            self.commits = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(scalar_one_or_none=lambda: None)
            return SimpleNamespace(scalar_one_or_none=lambda: "indexing")

        async def rollback(self):
            await anyio.lowlevel.checkpoint()
            self.rollbacks += 1

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    with pytest.raises(ManualBusyError):
        anyio.run(
            partial(
                begin_manual_reprocessing,
                session,
                owner_user_id=_USER_ID,
                manual_id=_MANUAL_ID,
                page_number=None,
            )
        )

    assert session.rollbacks == 1
    assert session.commits == 0


def test_begin_reprocessing_missing_manual_raises_404():
    """Un manual inexistente o ajeno se traduce al 404 estable."""

    class FakeSession:
        def __init__(self):
            self.calls = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            self.calls += 1
            return SimpleNamespace(scalar_one_or_none=lambda: None)

        async def rollback(self):
            await anyio.lowlevel.checkpoint()

    with pytest.raises(ManualNotFoundError):
        anyio.run(
            partial(
                begin_manual_reprocessing,
                FakeSession(),
                owner_user_id=_USER_ID,
                manual_id=_MANUAL_ID,
                page_number=None,
            )
        )


def test_begin_reprocessing_single_page_scopes_reset_and_chunks():
    """La variante por página resetea solo esa página y sus chunks."""
    statements = []

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            statements.append(statement)
            if len(statements) == 1:
                return SimpleNamespace(scalar_one_or_none=lambda: _MANUAL_ID)
            if len(statements) == 2:
                return SimpleNamespace(scalar_one_or_none=lambda: _PAGE_ID)
            if len(statements) == 3:
                return SimpleNamespace(rowcount=1)
            return SimpleNamespace(scalars=lambda: [uuid4()])

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    anyio.run(
        partial(
            begin_manual_reprocessing,
            session,
            owner_user_id=_USER_ID,
            manual_id=_MANUAL_ID,
            page_number=2,
        )
    )

    pages_reset = _compile(statements[2])
    assert "manual_pages.page_number =" in pages_reset
    assert "source_reused_from_page_id" in pages_reset
    assert "image_asset_id" not in pages_reset
    assert "ocr_lines" not in pages_reset
    assert "text_source" not in pages_reset
    stale_query = _compile(statements[3])
    assert "manual_chunks.page_id =" in stale_query


def test_begin_reprocessing_missing_page_releases_claim():
    """Una página inexistente deshace el claim para no dejar el manual colgado."""

    class FakeSession:
        def __init__(self):
            self.calls = 0
            self.rollbacks = 0
            self.commits = 0

        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(scalar_one_or_none=lambda: _MANUAL_ID)
            return SimpleNamespace(scalar_one_or_none=lambda: None)

        async def rollback(self):
            await anyio.lowlevel.checkpoint()
            self.rollbacks += 1

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    with pytest.raises(ManualNotFoundError):
        anyio.run(
            partial(
                begin_manual_reprocessing,
                session,
                owner_user_id=_USER_ID,
                manual_id=_MANUAL_ID,
                page_number=99,
            )
        )

    assert session.rollbacks == 1
    assert session.commits == 0


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


def _processing_rows() -> tuple[SimpleNamespace, list[SimpleNamespace]]:
    """Construye el estado de procesamiento recién reclamado."""
    manual = SimpleNamespace(id=_MANUAL_ID, status="indexing", page_count=2)
    pages = [
        SimpleNamespace(
            page_number=1, ocr_status="pending", text_quality=None, dedup_status="none"
        ),
        SimpleNamespace(
            page_number=2, ocr_status="pending", text_quality=None, dedup_status="none"
        ),
    ]
    return manual, pages


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
