"""Contrato HTTP de descubrimiento con PostgreSQL real y transacciones aisladas."""

import asyncio
import os
import selectors
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from api.main import app
from api.rate_limit import limiter
from database.models.game import Game
from database.models.manual import Manual
from database.models.user import User
from database.session import get_db_session


@pytest.fixture
def anyio_backend():
    if os.name == "nt":
        return "asyncio", {
            "loop_factory": lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        }
    return "asyncio"


@pytest.fixture
async def discovery_world():
    url = os.environ.get("DATABASE_URL")
    if not url:
        if os.environ.get("CI") == "true":
            pytest.fail("CI debe proporcionar DATABASE_URL para estos contratos.")
        pytest.skip("Se necesita PostgreSQL en manualito_test.")
    if make_url(url).database != "manualito_test":
        pytest.fail("Estos tests solo se ejecutan en la base aislada manualito_test.")

    engine = create_async_engine(url)
    limiter.reset()
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            token = uuid4().hex
            owner = User(
                email=f"{token}@example.test",
                username=token[:16],
                username_key=token[:16],
                password_hash="unused-in-catalog-test",
            )
            session.add(owner)
            await session.flush()

            async def database_session():
                yield session

            app.dependency_overrides[get_db_session] = database_session
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="https://testserver"
            ) as client:
                yield session, owner.id, client
            await session.rollback()
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        await engine.dispose()


async def add_game(session, owner_id, name, *, game_values=None, manual_values=None):
    game = Game(name=name, name_key=name.lower(), **(game_values or {}))
    session.add(game)
    await session.flush()
    values = {"status": "active", "visibility": "shared", "chunks_indexed": 1}
    values.update(manual_values or {})
    session.add(Manual(owner_user_id=owner_id, game_id=game.id, **values))
    await session.flush()
    return game


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("game_values", "manual_values"),
    [
        ({"status": "hidden"}, {}),
        ({"deleted_at": datetime.now(UTC)}, {}),
        ({}, {"visibility": "private"}),
        ({}, {"status": "indexing"}),
        ({}, {"status": "failed"}),
        ({}, {"status": "pending_review"}),
        ({}, {"status": "hidden"}),
        ({}, {"deleted_at": datetime.now(UTC)}),
        ({}, {"chunks_indexed": 0}),
    ],
)
async def test_discovery_excludes_unusable_manuals(discovery_world, game_values, manual_values):
    session, owner_id, client = discovery_world
    visible = await add_game(session, owner_id, "Disponible")
    await add_game(
        session, owner_id, "No disponible", game_values=game_values, manual_values=manual_values
    )
    session.add(Game(name="Solo catálogo", name_key="solo catálogo"))
    await session.flush()

    response = await client.get("/api/games/discover")

    assert response.status_code == 200
    games = response.json()["games"]
    assert [(game["id"], game["manuals_count"]) for game in games] == [(str(visible.id), 1)]


@pytest.mark.anyio
async def test_discovery_counts_manuals_without_repeating_games_and_respects_limit(discovery_world):
    session, owner_id, client = discovery_world
    first = await add_game(session, owner_id, "Primero")
    second = await add_game(session, owner_id, "Segundo")
    session.add(
        Manual(
            owner_user_id=owner_id,
            game_id=first.id,
            status="active",
            visibility="shared",
            chunks_indexed=2,
        )
    )
    session.add(
        Manual(
            owner_user_id=owner_id,
            game_id=first.id,
            status="active",
            visibility="private",
            chunks_indexed=3,
        )
    )
    await session.flush()

    response = await client.get("/api/games/discover", params={"limit": 20})
    assert response.status_code == 200
    assert {game["id"]: game["manuals_count"] for game in response.json()["games"]} == {
        str(first.id): 2,
        str(second.id): 1,
    }
    limited = await client.get("/api/games/discover", params={"limit": 1})
    assert len(limited.json()["games"]) == 1


@pytest.mark.anyio
async def test_discovery_empty_catalog_and_limit_validation(discovery_world):
    _, _, client = discovery_world
    assert (await client.get("/api/games/discover")).json()["games"] == []
    for limit in (0, 21, "invalid"):
        response = await client.get("/api/games/discover", params={"limit": limit})
        assert response.status_code == 422
