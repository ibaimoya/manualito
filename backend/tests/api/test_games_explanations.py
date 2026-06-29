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

import api.games.explanations as explanations_module
from api.auth.dependencies import get_current_auth
from api.auth.service import AuthenticatedSession
from api.exceptions import InternalServiceUnavailableError
from api.games.dto import (
    GameExplanationJob,
    GameExplanationOutcome,
    GameExplanationSnapshot,
)
from api.games.explanations import EXPLANATION_QUESTIONS, get_game_explanation
from api.games.repository import get_pool_fingerprint, upsert_game_explanation
from api.main import app
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.schemas import AnswerResponse, AnswerSource
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.user import User
from database.session import get_db_session

_FAKE_SESSION = object()
_USER_ID = uuid4()
_GAME_ID = UUID("018fd000-0000-7000-8000-000000000061")
_MANUAL_ID = UUID("018fd000-0000-7000-8000-000000000062")
_NOW = datetime(2026, 6, 10, 10, 0, tzinfo=UTC)
_FAKE_HASH = "hash-value"
_FINGERPRINT = "a" * 64
_SECTIONS: dict[str, object] = {
    "summary": {"answer": "Construyes una isla.", "sources": []},
    "setup": {"answer": "Coloca los hexágonos.", "sources": []},
    "turns": {"answer": "Tira, comercia y construye.", "sources": []},
    "victory": {"answer": "Llega a 10 puntos.", "sources": []},
}


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_auth_and_db():
    """Inyecta auth y sesión de BD falsas para el endpoint de explicación."""

    def _fake_db_session() -> Iterator[object]:
        yield _FAKE_SESSION

    app.dependency_overrides[get_db_session] = _fake_db_session
    app.dependency_overrides[get_current_auth] = lambda: _auth_session()
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        app.dependency_overrides.pop(get_current_auth, None)


def test_explanation_endpoint_returns_payload_and_enqueues_job(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El endpoint devuelve el estado y encola si el servicio lo pide."""
    explanation_mock = AsyncMock(
        return_value=GameExplanationOutcome(
            snapshot=_partial_explanation(status="generating"),
            job=GameExplanationJob(user_id=_USER_ID, game_id=_GAME_ID),
        )
    )
    delay_mock = MagicMock()
    monkeypatch.setattr("api.games.router.get_game_explanation", explanation_mock)
    monkeypatch.setattr(
        "api.games.router.generate_game_explanation_task.delay",
        delay_mock,
    )

    response = client.get(f"/api/games/{_GAME_ID}/explanation")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generating"
    explanation_mock.assert_awaited_once()
    delay_mock.assert_called_once_with(str(_USER_ID), str(_GAME_ID))


def test_explanation_endpoint_without_manuals_returns_stable_404(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """Sin manuales visibles la explicación responde el 404 de contexto."""
    monkeypatch.setattr(
        "api.games.router.get_game_explanation",
        AsyncMock(side_effect=ManualContextNotFoundError),
    )

    response = client.get(f"/api/games/{_GAME_ID}/explanation")

    assert response.status_code == 404
    assert any(error["code"] == "manual_context_not_found" for error in response.json()["errors"])


def test_explanation_cache_hit_skips_job(monkeypatch):
    """Con la huella intacta se sirve la caché lista del juego."""
    session = _read_session()
    cached = _cached_explanation(status="ready")
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, cached=cached)

    outcome = anyio.run(
        partial(
            get_game_explanation,
            session,
            auth=_auth(),
            game_id=_GAME_ID,
        )
    )

    response = explanations_module.build_game_explanation_response(outcome.snapshot)

    assert response.status == "ready"
    assert response.generated_at == _NOW
    assert outcome.job is None


def test_explanation_missing_cache_marks_generating_and_returns_job(monkeypatch):
    """Sin caché se persiste generating y se devuelve trabajo Celery."""
    session = _read_session()
    mark_mock = AsyncMock(return_value=_partial_explanation(status="generating"))
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, cached=None)
    monkeypatch.setattr(
        explanations_module.repository,
        "mark_game_explanation_generating",
        mark_mock,
    )

    outcome = anyio.run(
        partial(get_game_explanation, session, auth=_auth(), game_id=_GAME_ID)
    )

    assert outcome.snapshot.status == "generating"
    assert outcome.job == GameExplanationJob(
        user_id=_USER_ID,
        game_id=_GAME_ID,
    )
    mark_mock.assert_awaited_once()
    assert mark_mock.await_args.kwargs["user_id"] == _USER_ID
    assert mark_mock.await_args.kwargs["sections"] == {}


def test_fresh_generating_cache_does_not_requeue(monkeypatch):
    """El polling reutiliza un generating reciente sin crear otra task."""
    session = _read_session()
    mark_mock = AsyncMock()
    _patch_repo(
        monkeypatch,
        fingerprint=_FINGERPRINT,
        cached=_partial_explanation(status="generating", updated_at=datetime.now(UTC)),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "mark_game_explanation_generating",
        mark_mock,
    )

    outcome = anyio.run(
        partial(get_game_explanation, session, auth=_auth(), game_id=_GAME_ID)
    )

    assert outcome.snapshot.status == "generating"
    assert outcome.job is None
    mark_mock.assert_not_awaited()


def test_failed_cache_returns_failed_without_requeue(monkeypatch):
    """Un fallo persistido se expone y no crea más trabajos automáticamente."""
    session = _read_session()
    _patch_repo(
        monkeypatch,
        fingerprint=_FINGERPRINT,
        cached=_partial_explanation(status="failed", error_code="generation_failed"),
    )

    outcome = anyio.run(
        partial(get_game_explanation, session, auth=_auth(), game_id=_GAME_ID)
    )

    response = explanations_module.build_game_explanation_response(outcome.snapshot)

    assert response.status == "failed"
    assert response.error_code == "generation_failed"
    assert outcome.job is None


def test_worker_generates_all_sections_under_lock(monkeypatch):
    """El worker completa todos los apartados pendientes en una sola tarea."""
    lock_session = object()
    generate_mock = AsyncMock(
        side_effect=[
            AnswerResponse(
                answer="Construyes una isla.",
                sources=[
                    AnswerSource(
                        manual_id=_MANUAL_ID,
                        manual_title="Base",
                        page=2,
                        is_own=True,
                    )
                ],
            ),
            AnswerResponse(answer="Coloca los hexágonos.", sources=[]),
            AnswerResponse(answer="Tira, comercia y construye.", sources=[]),
            AnswerResponse(answer="Llega a 10 puntos.", sources=[]),
        ]
    )
    generating_mock = AsyncMock(return_value=_partial_explanation(status="generating"))
    upsert_mock = AsyncMock(return_value=_cached_explanation(status="ready"))
    _patch_worker_repo(monkeypatch, fingerprint=_FINGERPRINT, cached=None)
    monkeypatch.setattr(
        explanations_module,
        "advisory_session_lock",
        _fake_lock_factory(lock_session),
    )
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(
        explanations_module.repository,
        "mark_game_explanation_generating",
        generating_mock,
    )
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    completed = anyio.run(
        partial(explanations_module.generate_game_explanation, _USER_ID, _GAME_ID)
    )

    assert completed is True
    assert generate_mock.await_count == 4
    assert [
        call.kwargs["question"] for call in generate_mock.await_args_list
    ] == list(EXPLANATION_QUESTIONS.values())
    assert generating_mock.await_args.kwargs["user_id"] == _USER_ID
    assert upsert_mock.await_args.kwargs["user_id"] == _USER_ID
    assert upsert_mock.await_args.kwargs["sections"]["summary"]["sources"][0]["page"] == 2


def test_worker_returns_false_when_lock_is_busy(monkeypatch):
    """Si otro worker tiene el lock, Celery reintentará más tarde."""
    monkeypatch.setattr(explanations_module, "advisory_session_lock", _fake_lock_factory(None))

    completed = anyio.run(
        partial(explanations_module.generate_game_explanation, _USER_ID, _GAME_ID)
    )

    assert completed is False


def test_worker_marks_failed_on_internal_service_error(monkeypatch):
    """Un error esperado de LLM deja estado failed estable."""
    fail_mock = AsyncMock()
    _patch_worker_repo(monkeypatch, fingerprint=_FINGERPRINT, cached=None)
    monkeypatch.setattr(explanations_module, "advisory_session_lock", _fake_lock_factory(object()))
    monkeypatch.setattr(
        explanations_module,
        "generate_game_answer",
        AsyncMock(side_effect=InternalServiceUnavailableError("LLM no disponible.")),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "mark_game_explanation_failed",
        fail_mock,
    )

    completed = anyio.run(
        partial(explanations_module.generate_game_explanation, _USER_ID, _GAME_ID)
    )

    assert completed is True
    fail_mock.assert_awaited_once()
    assert fail_mock.await_args.kwargs["user_id"] == _USER_ID
    assert fail_mock.await_args.kwargs["error_code"] == "generation_failed"


def test_get_pool_fingerprint_hashes_visible_manuals_in_stable_order():
    """La huella combina id e indexado de los manuales visibles ordenados."""
    indexed_at = datetime(2026, 6, 9, 18, 0, tzinfo=UTC)

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return [
                SimpleNamespace(id=_MANUAL_ID, indexed_at=indexed_at),
                SimpleNamespace(id=_GAME_ID, indexed_at=None),
            ]

    session = FakeSession()

    fingerprint = anyio.run(
        partial(
            get_pool_fingerprint,
            session,
            game_id=_GAME_ID,
            current_user_id=_USER_ID,
        )
    )

    assert fingerprint is not None
    assert len(fingerprint) == 64
    compiled = _compile(session.statement)
    assert "manuals.visibility = " in compiled
    assert "manuals.deleted_at IS NULL" in compiled
    assert "ORDER BY manuals.id ASC" in compiled


def test_upsert_game_explanation_marks_ready_atomically():
    """El upsert por juego reemplaza secciones, huella y estado de una vez."""
    row = {
        "sections": _SECTIONS,
        "source_fingerprint": _FINGERPRINT,
        "status": "ready",
        "error_code": None,
        "generated_at": _NOW,
        "updated_at": _NOW,
    }

    class FakeMappings:
        def one(self):
            return row

    class FakeResult:
        def mappings(self):
            return FakeMappings()

    class FakeSession:
        def __init__(self):
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    stored = anyio.run(
        partial(
            upsert_game_explanation,
            session,
            user_id=_USER_ID,
            game_id=_GAME_ID,
            sections=_SECTIONS,
            source_fingerprint=_FINGERPRINT,
        )
    )

    assert stored == GameExplanationSnapshot(**row)
    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "INSERT INTO game_explanations" in compiled
    assert "ON CONFLICT (user_id, game_id) DO UPDATE" in compiled
    assert "status" in compiled
    assert "RETURNING" in compiled


def _patch_repo(monkeypatch, *, fingerprint: str | None, cached) -> None:
    """Fija juego, huella y caché para el servicio HTTP."""
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_for_detail",
        AsyncMock(return_value=SimpleNamespace(id=_GAME_ID)),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_pool_fingerprint",
        AsyncMock(return_value=fingerprint),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_explanation",
        AsyncMock(return_value=cached),
    )


def _patch_worker_repo(monkeypatch, *, fingerprint: str | None, cached) -> None:
    """Fija huella y caché para el worker."""
    monkeypatch.setattr(
        explanations_module.repository,
        "get_pool_fingerprint",
        AsyncMock(return_value=fingerprint),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_explanation",
        AsyncMock(return_value=cached),
    )


def _fake_lock_factory(lock_session):
    """Sustituye el advisory lock por una sesión falsa."""

    @asynccontextmanager
    async def fake_lock(_key):
        yield lock_session

    return fake_lock


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


def _read_session() -> SimpleNamespace:
    """Construye una sesión de lectura con rollback observable."""
    session = SimpleNamespace(rollbacks=0)

    async def rollback():
        await anyio.lowlevel.checkpoint()
        session.rollbacks += 1

    session.rollback = rollback
    return session


def _cached_explanation(*, status: str) -> GameExplanationSnapshot:
    """Construye la explicación cacheada completa que devuelve el repositorio."""
    return GameExplanationSnapshot(
        sections=_SECTIONS,
        source_fingerprint=_FINGERPRINT,
        status=status,
        error_code=None,
        generated_at=_NOW,
        updated_at=_NOW,
    )


def _partial_explanation(
    *,
    status: str,
    error_code: str | None = None,
    fingerprint: str = _FINGERPRINT,
    updated_at: datetime | None = None,
) -> GameExplanationSnapshot:
    """Construye una caché parcial de explicación."""
    return GameExplanationSnapshot(
        sections={"summary": _SECTIONS["summary"]} if status != "generating" else {},
        source_fingerprint=fingerprint,
        status=status,
        error_code=error_code,
        generated_at=None,
        updated_at=updated_at,
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
