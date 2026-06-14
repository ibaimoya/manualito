from collections.abc import Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import anyio
import pytest
from sqlalchemy.dialects import postgresql

import api.games.explanations as explanations_module
from api.auth.dependencies import get_current_auth
from api.auth.service import AuthenticatedSession
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
_FAKE_HASH = "hash-value"  # placeholder de hash en fixtures, no es una credencial
_FINGERPRINT = "a" * 64
_SECTIONS = {
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


def test_explanation_endpoint_returns_ready_payload(
    client,
    monkeypatch,
    override_auth_and_db,
):
    """El endpoint sirve las secciones cacheadas con su fecha de generación."""
    explanation_mock = AsyncMock(
        return_value=explanations_module.GameExplanationResponse(
            status="ready",
            sections=_SECTIONS,
            generated_at=_NOW,
        )
    )
    monkeypatch.setattr("api.games.router.get_game_explanation", explanation_mock)

    response = client.get(f"/api/games/{_GAME_ID}/explanation")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["sections"]["victory"]["answer"] == "Llega a 10 puntos."
    explanation_mock.assert_awaited_once()
    assert "client" in explanation_mock.await_args.kwargs
    assert "background_tasks" not in explanation_mock.await_args.kwargs


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


def test_explanation_cache_hit_skips_generation(monkeypatch):
    """Con la huella intacta se sirve la caché del juego sin tocar el LLM."""
    session = _read_session()
    generate_mock = AsyncMock()
    get_cached_mock = AsyncMock(return_value=_cached_explanation())
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_for_detail",
        AsyncMock(return_value=SimpleNamespace(id=_GAME_ID)),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_pool_fingerprint",
        AsyncMock(return_value=_FINGERPRINT),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_explanation",
        get_cached_mock,
    )
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)

    response = anyio.run(
        partial(
            get_game_explanation,
            session,
            auth=_auth(),
            game_id=_GAME_ID,
            client=object(),
        )
    )

    assert response.status == "ready"
    assert response.generated_at == _NOW
    get_cached_mock.assert_awaited_once_with(session, game_id=_GAME_ID)
    generate_mock.assert_not_called()
    assert session.rollbacks == 0


def test_first_poll_generates_only_the_summary_for_the_game(monkeypatch):
    """Sin caché previa la primera petición genera solo el resumen y avisa."""
    session = _read_session()
    lock_keys: list[str] = []
    _patch_lock(monkeypatch, object(), keys=lock_keys)
    generate_mock = AsyncMock(
        return_value=AnswerResponse(
            answer="Construyes una isla.",
            sources=[AnswerSource(manual_id=_MANUAL_ID, manual_title="Base", page=2, is_own=True)],
        )
    )
    upsert_mock = AsyncMock(return_value=_partial_explanation("summary"))
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, explanations=[None, None])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert list(response.sections) == ["summary"]
    assert response.sections["summary"].sources[0].page == 2
    assert lock_keys == [f"game-explanation:{_GAME_ID}"]
    generate_mock.assert_awaited_once()
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["summary"]
    assert session.rollbacks == 1
    assert upsert_mock.await_args.kwargs["game_id"] == _GAME_ID
    assert upsert_mock.await_args.kwargs["source_fingerprint"] == _FINGERPRINT
    assert "user_id" not in upsert_mock.await_args.kwargs
    assert set(upsert_mock.await_args.kwargs["sections"]) == {"summary"}


def test_partial_cache_generates_next_section_in_order(monkeypatch):
    """Con el resumen ya cacheado, la siguiente petición genera la preparación."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock(
        return_value=AnswerResponse(answer="Coloca los hexágonos.", sources=[])
    )
    upsert_mock = AsyncMock(return_value=_partial_explanation("summary", "setup"))
    cached = _partial_explanation("summary")
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, explanations=[cached, cached])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert list(response.sections) == ["summary", "setup"]
    generate_mock.assert_awaited_once()
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["setup"]
    assert set(upsert_mock.await_args.kwargs["sections"]) == {"summary", "setup"}
    assert "user_id" not in upsert_mock.await_args.kwargs


def test_last_section_completes_and_returns_ready(monkeypatch):
    """Al generar el cuarto apartado la explicación pasa a estado listo."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock(return_value=AnswerResponse(answer="Llega a 10 puntos.", sources=[]))
    upsert_mock = AsyncMock(
        return_value=SimpleNamespace(
            sections=_SECTIONS, source_fingerprint=_FINGERPRINT, generated_at=_NOW
        )
    )
    cached = _partial_explanation("summary", "setup", "turns")
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, explanations=[cached, cached])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "ready"
    assert response.generated_at == _NOW
    assert response.sections["victory"].answer == "Llega a 10 puntos."
    generate_mock.assert_awaited_once()
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["victory"]


def test_changed_fingerprint_restarts_from_summary(monkeypatch):
    """Una huella distinta descarta la caché parcial y reempieza por el resumen."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock(return_value=AnswerResponse(answer="Otro juego.", sources=[]))
    upsert_mock = AsyncMock(return_value=_partial_explanation("summary", fingerprint="b" * 64))
    stale = _partial_explanation("summary", "setup")
    _patch_repo(monkeypatch, fingerprint="b" * 64, explanations=[stale, stale])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert list(response.sections) == ["summary"]
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["summary"]
    assert upsert_mock.await_args.kwargs["source_fingerprint"] == "b" * 64
    assert set(upsert_mock.await_args.kwargs["sections"]) == {"summary"}


def test_visible_manuals_change_during_lock_uses_fresh_fingerprint(monkeypatch):
    """Si los manuales cambian mientras se espera el lock, manda la huella nueva."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock(return_value=AnswerResponse(answer="Otro juego.", sources=[]))
    upsert_mock = AsyncMock(return_value=_partial_explanation("summary", fingerprint="c" * 64))
    stale = _partial_explanation("summary", "setup")
    _patch_repo(monkeypatch, fingerprint=[_FINGERPRINT, "c" * 64], explanations=[stale, stale])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert list(response.sections) == ["summary"]
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["summary"]
    assert upsert_mock.await_args.kwargs["source_fingerprint"] == "c" * 64


def test_lock_winner_continues_from_fresh_partial(monkeypatch):
    """La primera lectura ve None y, bajo lock, un parcial fresco: sigue por setup."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock(
        return_value=AnswerResponse(answer="Coloca los hexágonos.", sources=[])
    )
    upsert_mock = AsyncMock(return_value=_partial_explanation("summary", "setup"))
    _patch_repo(
        monkeypatch,
        fingerprint=_FINGERPRINT,
        explanations=[None, _partial_explanation("summary")],
    )
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)
    monkeypatch.setattr(explanations_module.repository, "upsert_game_explanation", upsert_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert list(response.sections) == ["summary", "setup"]
    assert generate_mock.await_args.kwargs["question"] == EXPLANATION_QUESTIONS["setup"]


def test_visible_manuals_emptied_during_lock_reports_generating(monkeypatch):
    """Si no quedan manuales durante la espera del lock, se informa 'generating'."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock()
    _patch_repo(monkeypatch, fingerprint=[_FINGERPRINT, None], explanations=[None])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert response.sections is None
    generate_mock.assert_not_called()


def test_explanation_stampede_loser_reports_generating(monkeypatch):
    """La segunda pestaña no duplica la generación: recibe 'generating'."""
    session = _read_session()

    @asynccontextmanager
    async def busy_lock(_key):
        yield None

    generate_mock = AsyncMock()
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, explanations=[None])
    monkeypatch.setattr(explanations_module, "advisory_session_lock", busy_lock)
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)

    response = _run_get(session)

    assert response.status == "generating"
    assert response.sections is None
    generate_mock.assert_not_called()


def test_explanation_lock_winner_reuses_fresh_game_cache(monkeypatch):
    """Si otro proceso terminó mientras esperábamos, no se regenera de nuevo."""
    session = _read_session()
    _patch_lock(monkeypatch, object())
    generate_mock = AsyncMock()
    _patch_repo(monkeypatch, fingerprint=_FINGERPRINT, explanations=[None, _cached_explanation()])
    monkeypatch.setattr(explanations_module, "generate_game_answer", generate_mock)

    response = _run_get(session)

    assert response.status == "ready"
    generate_mock.assert_not_called()


def test_explanation_without_visible_manuals_raises_context_404(monkeypatch):
    """Sin manuales visibles no genera nada y responde contexto no encontrado."""
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_for_detail",
        AsyncMock(return_value=SimpleNamespace(id=_GAME_ID)),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_pool_fingerprint",
        AsyncMock(return_value=None),
    )

    with pytest.raises(ManualContextNotFoundError):
        anyio.run(
            partial(
                get_game_explanation,
                _read_session(),
                auth=_auth(),
                game_id=_GAME_ID,
                client=object(),
            )
        )


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


def test_get_pool_fingerprint_returns_none_for_empty_manual_set():
    """Sin manuales visibles no hay huella que comparar."""

    class FakeSession:
        async def execute(self, _statement):
            await anyio.lowlevel.checkpoint()
            return []

    fingerprint = anyio.run(
        partial(
            get_pool_fingerprint,
            FakeSession(),
            game_id=_GAME_ID,
            current_user_id=_USER_ID,
        )
    )

    assert fingerprint is None


def test_get_game_explanation_repository_filters_by_game_only():
    """La caché de explicaciones se busca por juego, sin usuario."""
    cached = object()

    class FakeResult:
        def scalar_one_or_none(self):
            return cached

    class FakeSession:
        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    explanation = anyio.run(
        partial(
            explanations_module.repository.get_game_explanation,
            session,
            game_id=_GAME_ID,
        )
    )

    assert explanation is cached
    compiled = _compile(session.statement)
    assert "game_explanations.game_id =" in compiled
    assert "game_explanations.user_id" not in compiled


def test_upsert_game_explanation_compiles_to_atomic_game_conflict_update():
    """El upsert por juego reemplaza secciones y huella de una vez."""
    row = SimpleNamespace(
        sections=_SECTIONS,
        source_fingerprint=_FINGERPRINT,
        generated_at=_NOW,
    )

    class FakeResult:
        def one(self):
            return row

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
            game_id=_GAME_ID,
            sections=_SECTIONS,
            source_fingerprint=_FINGERPRINT,
        )
    )

    assert stored is row
    assert session.commits == 1
    compiled = _compile(session.statement)
    assert "INSERT INTO game_explanations" in compiled
    assert "ON CONFLICT (game_id) DO UPDATE" in compiled
    assert "user_id" not in compiled
    assert "RETURNING" in compiled


def _patch_lock(monkeypatch, lock_session, *, keys: list[str] | None = None) -> None:
    """Sustituye el advisory lock por una sesión falsa ya adquirida."""

    @asynccontextmanager
    async def fake_lock(key):
        if keys is not None:
            keys.append(key)
        yield lock_session

    monkeypatch.setattr(explanations_module, "advisory_session_lock", fake_lock)


def _patch_repo(monkeypatch, *, fingerprint, explanations) -> None:
    """Fija juego, huella(s) de manuales y la secuencia de lecturas de caché."""
    fingerprint_mock = (
        AsyncMock(side_effect=fingerprint)
        if isinstance(fingerprint, list)
        else AsyncMock(return_value=fingerprint)
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_for_detail",
        AsyncMock(return_value=SimpleNamespace(id=_GAME_ID)),
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_pool_fingerprint",
        fingerprint_mock,
    )
    monkeypatch.setattr(
        explanations_module.repository,
        "get_game_explanation",
        AsyncMock(side_effect=explanations),
    )


def _run_get(session):
    """Ejecuta el servicio con auth y cliente falsos sobre la sesión dada."""
    return anyio.run(
        partial(get_game_explanation, session, auth=_auth(), game_id=_GAME_ID, client=object())
    )


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


def _cached_explanation() -> SimpleNamespace:
    """Construye la explicación cacheada completa que devuelve el repositorio."""
    return SimpleNamespace(
        sections=_SECTIONS,
        source_fingerprint=_FINGERPRINT,
        generated_at=_NOW,
    )


def _partial_explanation(*keys: str, fingerprint: str = _FINGERPRINT) -> SimpleNamespace:
    """Construye una caché con solo los apartados indicados."""
    return SimpleNamespace(
        sections={key: _SECTIONS[key] for key in keys},
        source_fingerprint=fingerprint,
        generated_at=None,
    )


def _compile(statement) -> str:
    """Compila SQLAlchemy con dialecto Postgres para inspección estable."""
    return str(statement.compile(dialect=postgresql.dialect()))
