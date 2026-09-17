"""PostgreSQL real. Solo se sustituyen la cola Celery y los servicios HTTP RAG/LLM."""

import asyncio
import json
import os
import selectors
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.engine import make_url

from api import config
from api.auth.tokens import hash_token
from api.games import explanations, repository
from api.games.dto import GameExplanationJob
from api.main import app
from api.rate_limit import limiter
from common.crypto import sha256_hex
from database.models.auth import AuthSession
from database.models.explanation import GameExplanation
from database.models.game import Game
from database.models.manual import Manual, ManualChunk
from database.models.user import User
from database.session import dispose_engine, get_sessionmaker


@pytest.fixture
def anyio_backend():
    if os.name == "nt":
        return "asyncio", {
            "loop_factory": lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        }
    return "asyncio"


@pytest.fixture
async def world(monkeypatch):
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("Requiere PostgreSQL en manualito_test.")
    assert make_url(url).database == "manualito_test"
    limiter.reset()
    users = [
        User(
            id=uuid4(),
            email=f"{uuid4().hex}@example.test",
            username=name,
            username_key=f"{name}_{uuid4().hex}",
            password_hash="unused",
        )
        for name in ("cache_a", "cache_b")
    ]
    game = Game(id=uuid4(), name="Juego de prueba", name_key=uuid4().hex)
    tokens = {user.id: uuid4().hex for user in users}
    state = SimpleNamespace(
        a=users[0], b=users[1], game=game, jobs=[], llm=[], on_generate=None, fail_llm=False
    )
    async with get_sessionmaker()() as session:
        session.add_all(users)
        session.add(game)
        await session.flush()
        session.add_all(
            [
                AuthSession(
                    user_id=user.id,
                    token_hash=hash_token(tokens[user.id]),
                    expires_at=datetime.now(UTC) + timedelta(hours=1),
                )
                for user in users
            ]
        )
        await session.commit()

    async def add_manual(visibility="shared"):
        async with get_sessionmaker()() as session:
            manual = Manual(
                id=uuid4(),
                owner_user_id=state.a.id,
                game_id=game.id,
                visibility=visibility,
                status="active",
                chunks_indexed=1,
                indexed_at=datetime.now(UTC),
            )
            session.add(manual)
            await session.flush()
            content = "Reglas publicas" if visibility == "shared" else "REGLA PRIVADA"
            session.add(
                ManualChunk(
                    id=uuid4(),
                    manual_id=manual.id,
                    chunk_index=0,
                    text=content,
                    source_page=1,
                    content_hash=sha256_hex(content),
                )
            )
            await session.commit()
            return manual

    state.add_manual = add_manual
    state.manual = await add_manual()
    real_client = httpx.AsyncClient

    async def external_http(request):
        payload = json.loads(request.content)
        if request.url.path == "/retrieve":
            async with get_sessionmaker()() as session:
                chunks = await session.scalars(
                    select(ManualChunk.id).where(
                        ManualChunk.manual_id.in_([UUID(value) for value in payload["manual_ids"]])
                    )
                )
                return httpx.Response(
                    200, json={"chunks": [{"id": str(value)} for value in chunks]}
                )
        assert request.url.path == "/generate"
        state.llm.append(payload)
        if state.on_generate is not None:
            await state.on_generate()
        if state.fail_llm:
            return httpx.Response(503, json={"detail": "LLM unavailable"})
        return httpx.Response(200, json={"answer": " / ".join(payload["context_chunks"])})

    def http_client(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(external_http))
        return real_client(*args, **kwargs)

    monkeypatch.setattr(explanations.httpx, "AsyncClient", http_client)
    monkeypatch.setattr(
        "api.games.router.generate_game_explanation_task.delay",
        lambda user, game, fingerprint: state.jobs.append(
            GameExplanationJob(UUID(user), UUID(game), fingerprint)
        ),
    )

    async def open_game(user):
        async with real_client(
            transport=httpx.ASGITransport(app=app),
            base_url="https://testserver",
            cookies={config.AUTH_SESSION_COOKIE_NAME: tokens[user.id]},
        ) as client:
            return await client.get(f"/api/games/{game.id}/explanation")

    state.open = open_game
    try:
        yield state
    finally:
        async with get_sessionmaker()() as session:
            await session.execute(delete(GameExplanation).where(GameExplanation.game_id == game.id))
            await session.execute(delete(Manual).where(Manual.game_id == game.id))
            await session.execute(delete(Game).where(Game.id == game.id))
            await session.execute(delete(User).where(User.id.in_(tokens)))
            await session.commit()
        await dispose_engine()
        limiter.reset()


async def run_job(job):
    return await explanations.generate_game_explanation(
        job.user_id, job.game_id, job.source_fingerprint
    )


@pytest.mark.anyio
async def test_same_manuals_share_generation_and_cache(world):
    first = await world.open(world.a)
    second = await world.open(world.b)
    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "generating"
    assert len(world.jobs) == 1
    assert await run_job(world.jobs[0]) is True
    assert len(world.llm) == 4
    first = (await world.open(world.a)).json()
    second = (await world.open(world.b)).json()
    assert first["status"] == second["status"] == "ready"
    assert first["generated_at"] == second["generated_at"]
    assert first["sections"]["summary"]["sources"][0]["is_own"] is True
    assert second["sections"]["summary"]["sources"][0]["is_own"] is False
    assert len(world.jobs) == 1


@pytest.mark.anyio
async def test_private_manuals_have_separate_cache_and_never_reach_other_users(world):
    private = await world.add_manual("private")
    await world.open(world.a)
    await world.open(world.b)
    assert len(world.jobs) == 2
    assert world.jobs[0].source_fingerprint != world.jobs[1].source_fingerprint
    for job in world.jobs:
        await run_job(job)
    owner = (await world.open(world.a)).json()
    other = (await world.open(world.b)).json()
    assert "REGLA PRIVADA" in owner["sections"]["summary"]["answer"]
    assert "REGLA PRIVADA" not in other["sections"]["summary"]["answer"]
    assert len(world.llm) == 8
    async with get_sessionmaker()() as session:
        await session.execute(delete(Manual).where(Manual.id == private.id))
        await session.commit()
    owner_without_private = (await world.open(world.a)).json()
    assert owner_without_private["generated_at"] == other["generated_at"]
    assert len(world.jobs) == 2


@pytest.mark.anyio
async def test_simultaneous_requests_enqueue_only_one_job(world):
    responses = await asyncio.gather(*(world.open(user) for user in [world.a, world.b] * 4))
    assert all(response.status_code == 200 for response in responses)
    assert len(world.jobs) == 1
    async with get_sessionmaker()() as session:
        rows = (
            await session.scalars(
                select(GameExplanation).where(GameExplanation.game_id == world.game.id)
            )
        ).all()
        assert len(rows) == 1


@pytest.mark.anyio
async def test_duplicate_workers_do_not_regenerate_sections(world):
    await world.open(world.a)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def hold_llm():
        entered.set()
        await release.wait()

    world.on_generate = hold_llm
    first = asyncio.create_task(run_job(world.jobs[0]))
    try:
        await asyncio.wait_for(entered.wait(), timeout=5)
        assert await run_job(world.jobs[0]) is False
    finally:
        release.set()
        await first
    assert await run_job(world.jobs[0]) is True
    assert len(world.llm) == 4


@pytest.mark.anyio
async def test_reindexing_changes_cache_without_overwriting_old_version(world):
    await world.open(world.a)
    await run_job(world.jobs[0])
    async with get_sessionmaker()() as session:
        await session.execute(
            update(Manual)
            .where(Manual.id == world.manual.id)
            .values(indexed_at=datetime.now(UTC) + timedelta(seconds=1))
        )
        await session.commit()
    assert (await world.open(world.b)).json()["status"] == "generating"
    assert len(world.jobs) == 2
    assert world.jobs[0].source_fingerprint != world.jobs[1].source_fingerprint
    async with get_sessionmaker()() as session:
        old = await repository.get_game_explanation(
            session, game_id=world.game.id, source_fingerprint=world.jobs[0].source_fingerprint
        )
        assert old.status == "ready"


@pytest.mark.anyio
async def test_without_visible_manuals_does_not_return_someone_elses_cache(world):
    async with get_sessionmaker()() as session:
        await session.execute(
            update(Manual).where(Manual.id == world.manual.id).values(visibility="private")
        )
        await session.commit()
    await world.open(world.a)
    await run_job(world.jobs[0])
    response = await world.open(world.b)
    assert response.status_code == 404
    assert len(world.jobs) == 1


@pytest.mark.anyio
async def test_stale_partial_generation_resumes_only_missing_sections(world):
    await world.open(world.a)
    job = world.jobs[0]
    async with get_sessionmaker()() as session:
        await session.execute(
            update(GameExplanation)
            .where(GameExplanation.game_id == world.game.id)
            .values(
                sections={"summary": {"answer": "Resumen existente", "sources": []}},
                updated_at=datetime.now(UTC)
                - explanations.GENERATION_STALE_AFTER
                - timedelta(seconds=1),
            )
        )
        await session.commit()
    response = (await world.open(world.b)).json()
    assert response["sections"]["summary"]["answer"] == "Resumen existente"
    assert len(world.jobs) == 2
    await run_job(world.jobs[1])
    assert len(world.llm) == 3
    assert all(
        item["question"] != explanations.EXPLANATION_QUESTIONS["summary"] for item in world.llm
    )
    await explanations.fail_game_explanation(job.game_id, job.source_fingerprint, "late_failure")
    assert (await world.open(world.a)).json()["status"] == "ready"


@pytest.mark.anyio
async def test_access_change_before_worker_discards_obsolete_job(world):
    await world.open(world.a)
    await world.add_manual("private")
    await run_job(world.jobs[0])
    assert world.llm == []
    assert (await world.open(world.b)).json()["status"] == "generating"
    assert len(world.jobs) == 2
    await run_job(world.jobs[1])
    assert len(world.llm) == 4
    assert all("REGLA PRIVADA" not in item["context_chunks"] for item in world.llm)


@pytest.mark.anyio
async def test_access_change_during_generation_does_not_cache_mixed_sources(world):
    await world.open(world.a)
    world.on_generate = lambda: world.add_manual("private")
    await run_job(world.jobs[0])
    assert len(world.llm) == 1
    async with get_sessionmaker()() as session:
        cached = await repository.get_game_explanation(
            session, game_id=world.game.id, source_fingerprint=world.jobs[0].source_fingerprint
        )
        assert cached is None
    world.on_generate = None
    await world.open(world.b)
    await run_job(world.jobs[1])
    assert (
        "REGLA PRIVADA" not in (await world.open(world.b)).json()["sections"]["summary"]["answer"]
    )


@pytest.mark.anyio
async def test_failure_is_shared_without_a_new_job_per_poll(world):
    await world.open(world.a)
    job = world.jobs[0]
    await explanations.fail_game_explanation(
        job.game_id, job.source_fingerprint, "generation_failed"
    )
    response = (await world.open(world.b)).json()
    assert response["status"] == "failed"
    assert response["error_code"] == "generation_failed"
    assert len(world.jobs) == 1
