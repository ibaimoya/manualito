"""Permisos de lectura y gestión con la API, autenticación y PostgreSQL reales."""

import asyncio
import os
import selectors
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from api import config
from api.auth.service import AuthenticatedSession
from api.auth.tokens import generate_opaque_token, hash_token
from api.main import app
from api.manuals.service import delete_manual
from api.rate_limit import limiter
from database.models.asset import Asset
from database.models.auth import AuthSession
from database.models.game import Game
from database.models.manual import Manual, ManualPage
from database.models.user import User
from database.session import dispose_engine, get_sessionmaker

_IMAGE_BYTES = b"imagen-de-prueba"
_PAGE_TEXT = "Gana quien llegue a diez puntos."


@dataclass(frozen=True, slots=True)
class ReaderWorld:
    sessions: async_sessionmaker[AsyncSession]
    owner: User
    reader: User
    game: Game
    asset_root: Path


@pytest.fixture
def anyio_backend():
    if os.name == "nt":
        return "asyncio", {
            "loop_factory": lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        }
    return "asyncio"


@pytest.fixture
async def world(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[ReaderWorld]:
    database_url = os.environ.get("DATABASE_URL")
    if database_url is None:
        if os.environ.get("CI") == "true":
            pytest.fail("CI debe proporcionar DATABASE_URL para estos contratos.")
        pytest.skip("Los contratos PostgreSQL requieren DATABASE_URL.")
    if make_url(database_url).database != "manualito_test":
        pytest.fail("Los contratos PostgreSQL exigen la base aislada manualito_test.")

    await dispose_engine()
    limiter.reset()
    asset_root = tmp_path / "assets"
    monkeypatch.setattr(config, "ASSET_STORAGE_DIR", str(asset_root))
    sessions = get_sessionmaker()
    owner = _user("owner")
    reader = _user("reader")
    game = Game(name=f"Juego lectura {uuid4().hex[:8]}", name_key=uuid4().hex)
    async with sessions() as session:
        session.add_all((owner, reader, game))
        await session.commit()
    try:
        yield ReaderWorld(
            sessions=sessions, owner=owner, reader=reader, game=game, asset_root=asset_root
        )
    finally:
        async with sessions() as session:
            await session.execute(delete(Manual).where(Manual.game_id == game.id))
            await session.execute(delete(Game).where(Game.id == game.id))
            await session.execute(delete(User).where(User.id.in_([owner.id, reader.id])))
            await session.commit()
        await dispose_engine()


@pytest.mark.anyio
async def test_propietario_y_lector_leen_un_manual_compartido_activo(world: ReaderWorld):
    manual = await _seed_manual(world, visibility="shared", status="active")

    async with await _authed_client(world, world.owner) as owner:
        as_owner = await owner.get(f"/api/manuals/{manual.id}")
    async with await _authed_client(world, world.reader) as reader:
        as_reader = await reader.get(f"/api/manuals/{manual.id}")
        image = await reader.get(f"/api/manuals/{manual.id}/pages/1/image")
        listing = await reader.get("/api/manuals")

    assert as_owner.status_code == as_reader.status_code == 200
    assert as_owner.json()["is_own"] is True
    body = as_reader.json()
    assert body["is_own"] is False
    assert (body["title"], body["visibility"], body["status"]) == ("Reglas", "shared", "active")
    assert body["pages"][0]["image_available"] is True
    assert body["pages"][0]["ocr_lines"][0]["text"] == _PAGE_TEXT
    assert "owner_user_id" not in body
    assert str(world.owner.id) not in as_reader.text
    assert world.owner.username not in as_reader.text
    assert image.status_code == 200
    assert image.content == _IMAGE_BYTES
    assert image.headers["cache-control"].startswith("private")
    assert listing.json() == {"manuals": []}


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("visibility", "status"),
    [
        ("private", "active"),
        ("shared", "indexing"),
        ("shared", "pending_review"),
        ("shared", "failed"),
    ],
)
async def test_solo_el_propietario_lee_manuales_privados_o_no_activos(
    world: ReaderWorld, visibility: str, status: str
):
    manual = await _seed_manual(world, visibility=visibility, status=status)

    async with await _authed_client(world, world.reader) as reader:
        detail = await reader.get(f"/api/manuals/{manual.id}")
        image = await reader.get(f"/api/manuals/{manual.id}/pages/1/image")
    async with await _authed_client(world, world.owner) as owner:
        own_detail = await owner.get(f"/api/manuals/{manual.id}")
        own_image = await owner.get(f"/api/manuals/{manual.id}/pages/1/image")

    assert detail.status_code == image.status_code == 404
    assert _has_error(detail.json(), code="manual_not_found")
    assert _has_error(image.json(), code="manual_not_found")
    assert own_detail.status_code == own_image.status_code == 200
    assert own_detail.json()["is_own"] is True


@pytest.mark.anyio
async def test_un_manual_borrado_no_se_lee_aunque_fuera_compartido(world: ReaderWorld):
    manual = await _seed_manual(world, visibility="shared", status="active")
    async with world.sessions() as session:
        await delete_manual(session, auth=_auth(world.owner), manual_id=manual.id)

    statuses: dict[str, int] = {}
    for label, user in (("owner", world.owner), ("reader", world.reader)):
        async with await _authed_client(world, user) as client:
            detail = await client.get(f"/api/manuals/{manual.id}")
            image = await client.get(f"/api/manuals/{manual.id}/pages/1/image")
        statuses[f"{label}_detail"] = detail.status_code
        statuses[f"{label}_image"] = image.status_code

    assert statuses == {
        "owner_detail": 404,
        "owner_image": 404,
        "reader_detail": 404,
        "reader_image": 404,
    }


@pytest.mark.anyio
async def test_el_lector_no_puede_gestionar_un_manual_compartido(world: ReaderWorld):
    manual = await _seed_manual(world, visibility="shared", status="active")
    url = f"/api/manuals/{manual.id}"

    async with await _authed_client(world, world.reader) as reader:
        responses = {
            "rename": await reader.patch(url, json={"title": "Robado"}),
            "attribute": await reader.patch(url, json={"anonymous": False}),
            "delete": await reader.delete(url),
            "reprocess": await reader.post(f"{url}/reprocess"),
            "reprocess_page": await reader.post(f"{url}/pages/1/reprocess"),
            "edit_text": await reader.put(f"{url}/pages/1/text", json={"text": "Texto ajeno"}),
            "processing": await reader.get(f"{url}/processing"),
        }

    statuses = {name: response.status_code for name, response in responses.items()}
    assert statuses == dict.fromkeys(responses, 404)
    for response in responses.values():
        assert _has_error(response.json(), code="manual_not_found")
    async with world.sessions() as session:
        row = (
            await session.execute(
                select(Manual.title, Manual.anonymous, Manual.status, Manual.deleted_at).where(
                    Manual.id == manual.id
                )
            )
        ).one()
        page = (
            await session.execute(
                select(ManualPage.ocr_status, ManualPage.text_source, ManualPage.ocr_lines).where(
                    ManualPage.manual_id == manual.id
                )
            )
        ).one()
    assert (row.title, row.anonymous, row.status) == ("Reglas", True, "active")
    assert row.deleted_at is None
    assert (page.ocr_status, page.text_source) == ("completed", "ocr")
    assert page.ocr_lines[0]["text"] == _PAGE_TEXT


def _user(prefix: str) -> User:
    key = f"{prefix}_{uuid4().hex[:12]}"
    return User(
        email=f"{key}@tests.local",
        password_hash="hash-de-pruebas",
        username=key,
        username_key=key,
    )


def _auth(user: User) -> AuthenticatedSession:
    return AuthenticatedSession(
        user=user,
        auth_session=AuthSession(
            user_id=user.id,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        ),
        session_token="session-token",
        csrf_token="csrf-token",
    )


async def _authed_client(world: ReaderWorld, user: User) -> httpx.AsyncClient:
    session_token = generate_opaque_token()
    csrf_token = generate_opaque_token()
    async with world.sessions() as session:
        session.add(
            AuthSession(
                user_id=user.id,
                token_hash=hash_token(session_token),
                csrf_token_hash=hash_token(csrf_token),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await session.commit()
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        cookies={
            config.AUTH_SESSION_COOKIE_NAME: session_token,
            config.AUTH_CSRF_COOKIE_NAME: csrf_token,
        },
        headers={config.AUTH_CSRF_HEADER_NAME: csrf_token},
    )


async def _seed_manual(world: ReaderWorld, *, visibility: str, status: str) -> Manual:
    """Guarda un manual de prueba con texto e imagen."""
    async with world.sessions() as session:
        manual = Manual(
            owner_user_id=world.owner.id,
            game_id=world.game.id,
            title="Reglas",
            visibility=visibility,
            status=status,
            page_count=1,
            chunks_indexed=1,
            indexed_at=datetime.now(UTC),
        )
        session.add(manual)
        await session.flush()
        storage_key = f"manuals/{world.owner.id}/{manual.id}/page-1.jpg"
        asset = Asset(
            owner_user_id=world.owner.id,
            kind="manual_page_image",
            storage_key=storage_key,
            mime_type="image/jpeg",
            byte_size=len(_IMAGE_BYTES),
            sha256="a" * 64,
            width=10,
            height=10,
        )
        session.add(asset)
        await session.flush()
        session.add(
            ManualPage(
                manual_id=manual.id,
                page_number=1,
                image_asset_id=asset.id,
                ocr_status="completed",
                text_source="ocr",
                text_quality="ok",
                ocr_confidence_mean=0.9,
                ocr_lines=[{"text": _PAGE_TEXT, "confidence": 0.9}],
            )
        )
        await session.commit()
    image_path = world.asset_root / storage_key
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(_IMAGE_BYTES)
    return manual


def _has_error(body: dict[str, Any], *, code: str) -> bool:
    return any(error["code"] == code for error in body["errors"])
