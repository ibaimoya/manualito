"""Consultas y escrituras SQL de manuales."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.manuals.exceptions import ManualContextNotFoundError, ManualNotFoundError
from api.manuals.validation import ValidatedManualImage
from database.models.asset import Asset
from database.models.game import Game
from database.models.manual import Manual, ManualChunk, ManualPage


@dataclass(frozen=True, slots=True)
class PreparedChunk:
    """Chunk generado antes de persistir e indexar."""

    text: str
    chunk_index: int
    source_page: int
    content_hash: str


@dataclass(frozen=True, slots=True)
class PersistedManual:
    """Manual persistido con los chunks que debe indexar RAG."""

    manual: Manual
    chunks: list[ManualChunk]


@dataclass(frozen=True, slots=True)
class AuthorizedChunk:
    """Chunk autorizado para construir contexto del LLM."""

    id: UUID
    text: str
    content_hash: str


@dataclass(frozen=True, slots=True)
class ManualDetailRow:
    """Detalle completo de manual propio."""

    summary: Row
    pages: list[Row]

    def __getattr__(self, name: str) -> object:
        """Permite a Pydantic leer campos del resumen con from_attributes."""
        return getattr(self.summary, name)


@dataclass(frozen=True, slots=True)
class DeletedManualAssets:
    """Datos necesarios para limpiar storage y Chroma tras el commit."""

    manual_id: UUID
    chunk_ids: list[UUID]
    storage_keys: list[str]


async def create_manual_with_page_and_chunks(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    game_id: UUID,
    title: str | None,
    visibility: str,
    language: str | None,
    image: ValidatedManualImage,
    storage_key: str,
    ocr_lines: list[dict[str, object]],
    chunks: list[PreparedChunk],
) -> PersistedManual:
    """Persiste manual, asset, página y chunks en una transacción."""
    manual = Manual(
        owner_user_id=owner_user_id,
        game_id=game_id,
        title=title,
        status="indexing",
        language=language,
        visibility=visibility,
        chunks_indexed=0,
    )
    session.add(manual)
    await session.flush()

    asset = Asset(
        owner_user_id=owner_user_id,
        kind="manual_page_image",
        storage_key=storage_key,
        mime_type=image.mime_type,
        byte_size=len(image.content),
        sha256=image.sha256,
        width=image.width,
        height=image.height,
    )
    session.add(asset)
    await session.flush()

    page = ManualPage(
        manual_id=manual.id,
        page_number=1,
        image_asset_id=asset.id,
        ocr_lines=ocr_lines,
        ocr_status="completed",
    )
    session.add(page)
    await session.flush()

    persisted_chunks = [
        ManualChunk(
            manual_id=manual.id,
            page_id=page.id,
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            source_page=chunk.source_page,
            content_hash=chunk.content_hash,
        )
        for chunk in chunks
    ]
    session.add_all(persisted_chunks)
    await session.flush()
    await session.commit()
    return PersistedManual(manual=manual, chunks=persisted_chunks)


async def list_user_manuals(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    limit: int,
    offset: int,
) -> list[Row]:
    """Lista manuales propios sin cargar relaciones perezosas."""
    result = await session.execute(
        _manual_summary_query(owner_user_id)
        .limit(limit)
        .offset(offset)
    )
    return list(result)


async def get_user_manual_detail(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
) -> ManualDetailRow:
    """Carga detalle de manual con ownership embebido en la query."""
    result = await session.execute(
        _manual_summary_query(owner_user_id).where(Manual.id == manual_id)
    )
    summary_row = result.one_or_none()
    if summary_row is None:
        raise ManualNotFoundError

    pages_result = await session.execute(
        select(
            ManualPage.page_number,
            ManualPage.ocr_status,
            ManualPage.ocr_lines,
        )
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return ManualDetailRow(
        summary=summary_row,
        pages=list(pages_result),
    )


async def soft_delete_user_manual(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
) -> DeletedManualAssets:
    """Marca un manual propio como borrado y devuelve recursos a limpiar."""
    result = await session.execute(
        select(Manual).where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
        )
    )
    manual = result.scalar_one_or_none()
    if manual is None:
        raise ManualNotFoundError

    chunk_ids_result = await session.execute(
        select(ManualChunk.id).where(ManualChunk.manual_id == manual_id)
    )
    chunk_ids = list(chunk_ids_result.scalars())

    assets_result = await session.execute(
        select(Asset)
        .join(ManualPage, ManualPage.image_asset_id == Asset.id)
        .where(
            ManualPage.manual_id == manual_id,
            Asset.deleted_at.is_(None),
        )
    )
    assets = list(assets_result.scalars())
    storage_keys = [asset.storage_key for asset in assets]

    deleted_at = func.now()
    manual.deleted_at = deleted_at
    manual.status = "hidden"
    for asset in assets:
        asset.deleted_at = deleted_at

    await session.commit()
    return DeletedManualAssets(
        manual_id=manual_id,
        chunk_ids=chunk_ids,
        storage_keys=storage_keys,
    )


async def mark_manual_indexed(
    session: AsyncSession,
    *,
    manual_id: UUID,
    chunk_ids: set[UUID],
    embedding_model: str,
    indexed_at: datetime,
) -> None:
    """Marca un manual y sus chunks como sincronizados en Chroma."""
    manual = await session.get(Manual, manual_id)
    if manual is None:
        raise ManualContextNotFoundError

    result = await session.execute(
        select(ManualChunk).where(
            ManualChunk.manual_id == manual_id,
            ManualChunk.id.in_(chunk_ids),
        )
    )
    chunks = list(result.scalars())
    for chunk in chunks:
        chunk.embedding_model = embedding_model
        chunk.indexed_at = indexed_at

    manual.status = "active"
    manual.chunks_indexed = len(chunks)
    manual.indexed_at = indexed_at
    await session.commit()


async def mark_manual_failed(session: AsyncSession, *, manual_id: UUID) -> None:
    """Marca el manual como fallido si el indexado en Chroma no termina."""
    manual = await session.get(Manual, manual_id)
    if manual is None:
        return
    manual.status = "failed"
    await session.commit()


async def load_authorized_chunks(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
    chunk_ids: list[UUID],
) -> list[AuthorizedChunk]:
    """Rehidrata chunks desde Postgres aplicando permisos en la query."""
    if not chunk_ids:
        raise ManualContextNotFoundError

    result = await session.execute(_authorized_chunks_query(game_id, current_user_id, chunk_ids))
    chunks_by_id = {
        row.id: AuthorizedChunk(
            id=row.id,
            text=row.text,
            content_hash=row.content_hash,
        )
        for row in result
    }
    ordered = [chunks_by_id[chunk_id] for chunk_id in chunk_ids if chunk_id in chunks_by_id]
    if not ordered:
        raise ManualContextNotFoundError
    return ordered


def _authorized_chunks_query(
    game_id: UUID,
    current_user_id: UUID,
    chunk_ids: list[UUID],
) -> Select:
    """Construye la query con ownership y visibilidad embebidos."""
    return (
        select(
            ManualChunk.id,
            ManualChunk.text,
            ManualChunk.content_hash,
        )
        .join(Manual, Manual.id == ManualChunk.manual_id)
        .where(
            ManualChunk.id.in_(chunk_ids),
            Manual.game_id == game_id,
            Manual.deleted_at.is_(None),
            or_(
                (
                    (Manual.visibility == "shared")
                    & (Manual.status == "active")
                ),
                (
                    (Manual.owner_user_id == current_user_id)
                    & (Manual.status.in_(("active", "pending_review")))
                ),
            ),
        )
    )


def _manual_summary_query(owner_user_id: UUID) -> Select:
    """Construye el listado base de manuales propios."""
    return (
        select(
            Manual.id,
            Manual.game_id,
            Game.name.label("game_name"),
            Manual.title,
            Manual.status,
            Manual.visibility,
            Manual.language,
            Manual.chunks_indexed,
            Manual.created_at,
            Manual.indexed_at,
        )
        .join(Game, Game.id == Manual.game_id)
        .where(
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
        )
        .order_by(Manual.created_at.desc(), Manual.id.desc())
    )
