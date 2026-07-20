import asyncio
import os
import selectors
import shutil
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi import UploadFile
from sqlalchemy import delete, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import Headers

from api import config
from api.assets.storage import AssetWriteBatch, LocalAssetStore
from api.auth.service import AuthenticatedSession
from api.exceptions import InvalidImageError
from api.manuals import service as manuals_service
from api.manuals.repository import (
    get_user_manual_detail,
    get_user_manual_page_image_asset,
    list_user_manuals,
)
from api.manuals.service import create_manual, reconcile_pending_asset_batches
from database.models.asset import Asset
from database.models.auth import AuthSession
from database.models.game import Game
from database.models.user import User
from database.session import dispose_engine, get_sessionmaker


@dataclass(frozen=True, slots=True)
class PostgresUploadWorld:
    sessions: async_sessionmaker[AsyncSession]
    auth: AuthenticatedSession
    owner_user_id: UUID
    game_id: UUID
    asset_root: Path
    store: LocalAssetStore


@pytest.fixture
def anyio_backend():
    """Psycopg async necesita un loop selector en Windows."""
    if os.name == "nt":
        return "asyncio", {"loop_factory": _selector_event_loop}
    return "asyncio"


@pytest.fixture
async def postgres_upload_world(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[PostgresUploadWorld]:
    """Siembra el mínimo dominio real y elimina sus filas al terminar."""
    database_url = os.environ.get("DATABASE_URL")
    if database_url is None:
        if os.environ.get("CI") == "true":
            pytest.fail("CI debe proporcionar DATABASE_URL para estos contratos.")
        pytest.skip("Los contratos PostgreSQL requieren DATABASE_URL.")
    if make_url(database_url).database != "manualito_test":
        pytest.fail("Los contratos PostgreSQL exigen la base aislada manualito_test.")

    await dispose_engine()
    asset_root = tmp_path / "assets"
    monkeypatch.setattr(config, "ASSET_STORAGE_DIR", str(asset_root))
    sessions = get_sessionmaker()
    token = uuid4().hex
    seeded = False
    try:
        async with sessions() as session:
            user = User(
                email=f"upload-{token}@example.test",
                username=f"u_{token[:16]}",
                username_key=f"u_{token[:16]}",
                password_hash="integration-test-password-hash",
                role="user",
                status="active",
            )
            session.add(user)
            await session.flush()
            game = Game(
                name=f"Upload contract {token}",
                name_key=f"upload contract {token}",
                status="active",
                created_by_user_id=user.id,
            )
            session.add(game)
            await session.commit()
            seeded = True

        auth = AuthenticatedSession(
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
        yield PostgresUploadWorld(
            sessions=sessions,
            auth=auth,
            owner_user_id=user.id,
            game_id=game.id,
            asset_root=asset_root,
            store=LocalAssetStore(asset_root),
        )
    finally:
        try:
            if seeded:
                async with sessions() as session:
                    await session.execute(delete(User).where(User.id == user.id))
                    await session.execute(delete(Game).where(Game.id == game.id))
                    await session.commit()
        finally:
            shutil.rmtree(asset_root, ignore_errors=True)
            await dispose_engine()


@pytest.mark.anyio
async def test_create_manual_commits_queryable_image_and_adopts_assets(
    postgres_upload_world: PostgresUploadWorld,
    valid_jpeg_bytes: bytes,
) -> None:
    """El caso de uso confirma DB y publica un lote ya no pendiente."""
    world = postgres_upload_world
    upload = _image_upload(valid_jpeg_bytes)

    async with world.sessions() as session:
        created = await create_manual(
            session,
            auth=world.auth,
            game_id=world.game_id,
            title="  Reglamento real  ",
            visibility="private",
            language="  es  ",
            images=[upload],
            pdf=None,
        )

    async with world.sessions() as session:
        detail = await get_user_manual_detail(
            session,
            owner_user_id=world.owner_user_id,
            manual_id=created.manual_id,
        )
        image = await get_user_manual_page_image_asset(
            session,
            owner_user_id=world.owner_user_id,
            manual_id=created.manual_id,
            page_number=1,
        )

    assert created.status == "indexing"
    assert detail.title == "Reglamento real"
    assert detail.language == "es"
    assert detail.page_count == 1
    assert detail.pages[0].image_available is True
    assert image is not None
    stored_path = world.store.resolve_file(image.storage_key)
    assert stored_path.read_bytes() == valid_jpeg_bytes
    assert not (stored_path.parent / ".pending").exists()
    assert not list(world.asset_root.rglob("*.part"))
    assert upload.file.closed


@pytest.mark.anyio
async def test_create_manual_tolera_fallo_al_adoptar(
    postgres_upload_world: PostgresUploadWorld,
    valid_jpeg_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un fallo inyectado del sistema de archivos no invalida el manual confirmado."""

    async def fail_adopt(_batch: AssetWriteBatch) -> None:
        raise OSError("fallo de adopción inyectado")

    monkeypatch.setattr(AssetWriteBatch, "adopt", fail_adopt)
    world = postgres_upload_world

    async with world.sessions() as session:
        created = await create_manual(
            session,
            auth=world.auth,
            game_id=world.game_id,
            title="Persistido tras fallo de adopción",
            visibility="private",
            language="es",
            images=[_image_upload(valid_jpeg_bytes)],
            pdf=None,
        )

    async with world.sessions() as session:
        detail = await get_user_manual_detail(
            session,
            owner_user_id=world.owner_user_id,
            manual_id=created.manual_id,
        )

    assert detail.title == "Persistido tras fallo de adopción"


@pytest.mark.anyio
async def test_create_manual_tolera_fallo_al_autoseguir(
    postgres_upload_world: PostgresUploadWorld,
    valid_jpeg_bytes: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Un error real de PostgreSQL en el auto-follow se revierte tras el commit."""

    async def fail_auto_follow(
        session: AsyncSession,
        *,
        user_id: UUID,
        game_id: UUID,
    ) -> None:
        del user_id, game_id
        await session.execute(text("SELECT 1 / 0"))

    monkeypatch.setattr(manuals_service.games_repository, "auto_follow_game", fail_auto_follow)
    world = postgres_upload_world

    async with world.sessions() as session:
        created = await create_manual(
            session,
            auth=world.auth,
            game_id=world.game_id,
            title="Persistido sin auto-follow",
            visibility="private",
            language="es",
            images=[_image_upload(valid_jpeg_bytes)],
            pdf=None,
        )
        detail = await get_user_manual_detail(
            session,
            owner_user_id=world.owner_user_id,
            manual_id=created.manual_id,
        )

    assert detail.title == "Persistido sin auto-follow"


@pytest.mark.anyio
async def test_invalid_second_image_rolls_back_database_and_storage(
    postgres_upload_world: PostgresUploadWorld,
    valid_jpeg_bytes: bytes,
) -> None:
    """Una página inválida aborta también la imagen válida anterior."""
    world = postgres_upload_world
    first = _image_upload(valid_jpeg_bytes)
    invalid = _image_upload(b"not-a-jpeg")

    async with world.sessions() as session:
        with pytest.raises(InvalidImageError):
            await create_manual(
                session,
                auth=world.auth,
                game_id=world.game_id,
                title=None,
                visibility="private",
                language=None,
                images=[first, invalid],
                pdf=None,
            )

    async with world.sessions() as session:
        manuals = await list_user_manuals(
            session,
            owner_user_id=world.owner_user_id,
            limit=10,
            offset=0,
        )
        asset_count = await session.scalar(
            select(func.count())
            .select_from(Asset)
            .where(Asset.owner_user_id == world.owner_user_id)
        )

    assert manuals == []
    assert asset_count == 0
    assert not [path for path in world.asset_root.rglob("*") if path.is_file()]
    assert first.file.closed
    assert invalid.file.closed


@pytest.mark.anyio
async def test_reconciliation_adopts_referenced_batch_and_deletes_orphan(
    postgres_upload_world: PostgresUploadWorld,
    valid_jpeg_bytes: bytes,
) -> None:
    """La recuperación conserva solo el lote que PostgreSQL referencia."""
    world = postgres_upload_world

    referenced = await world.store.create_manual_batch(owner_user_id=world.owner_user_id)
    referenced_staged = await referenced.stage(
        BytesIO(valid_jpeg_bytes),
        max_bytes=len(valid_jpeg_bytes),
    )
    referenced_key = await referenced.promote(
        referenced_staged,
        name="page-1",
        extension=".jpg",
    )
    orphan = await world.store.create_manual_batch(owner_user_id=world.owner_user_id)
    orphan_staged = await orphan.stage(
        BytesIO(valid_jpeg_bytes),
        max_bytes=len(valid_jpeg_bytes),
    )
    orphan_key = await orphan.promote(orphan_staged, name="page-1", extension=".jpg")

    async with world.sessions() as session:
        session.add(
            Asset(
                owner_user_id=world.owner_user_id,
                kind="manual_page_image",
                storage_key=referenced_key,
                mime_type="image/jpeg",
                byte_size=referenced_staged.byte_size,
                sha256=referenced_staged.sha256,
                width=10,
                height=10,
            )
        )
        await session.commit()

    referenced_path = world.store.resolve_file(referenced_key)
    referenced_marker = referenced.path / ".pending"
    orphan_path = world.store.resolve_file(orphan_key)

    old_timestamp = (
        datetime.now(UTC)
        - timedelta(seconds=config.ASSET_PENDING_BATCH_TTL_SECONDS + 60)
    ).timestamp()
    os.utime(referenced_marker, (old_timestamp, old_timestamp))
    os.utime(orphan.path / ".pending", (old_timestamp, old_timestamp))

    assert await reconcile_pending_asset_batches() == (1, 1)
    assert referenced_path.is_file()
    assert not referenced_marker.exists()
    assert not orphan.path.exists()
    assert not orphan_path.exists()


def _image_upload(content: bytes) -> UploadFile:
    return UploadFile(
        BytesIO(content),
        filename="ignored-user-name.jpg",
        size=len(content),
        headers=Headers({"content-type": "image/jpeg"}),
    )


def _selector_event_loop() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop(selectors.SelectSelector())
