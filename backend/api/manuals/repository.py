"""Consultas y escrituras SQL de manuales."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.manuals.exceptions import ManualContextNotFoundError, ManualNotFoundError
from api.manuals.validation import ValidatedManualImage, ValidatedManualPdf
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
class StoredManualImage:
    """Imagen validada y ya guardada en storage."""

    page_number: int
    image: ValidatedManualImage
    storage_key: str


@dataclass(frozen=True, slots=True)
class StoredManualPdf:
    """PDF validado y ya guardado en storage."""

    pdf: ValidatedManualPdf
    storage_key: str


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


async def create_manual_with_pending_pages(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    game_id: UUID,
    title: str | None,
    visibility: str,
    language: str | None,
    source_type: str,
    page_count: int,
    images: list[StoredManualImage],
    source_pdf: StoredManualPdf | None = None,
) -> Manual:
    """Crea el manual y sus páginas pendientes antes de procesarlas."""
    manual = Manual(
        owner_user_id=owner_user_id,
        game_id=game_id,
        title=title,
        source_type=source_type,
        page_count=page_count,
        status="indexing",
        language=language,
        visibility=visibility,
        chunks_indexed=0,
    )
    session.add(manual)
    await session.flush()

    if source_pdf is not None:
        asset = Asset(
            owner_user_id=owner_user_id,
            kind="manual_source_pdf",
            storage_key=source_pdf.storage_key,
            mime_type=source_pdf.pdf.mime_type,
            byte_size=len(source_pdf.pdf.content),
            sha256=source_pdf.pdf.sha256,
            width=None,
            height=None,
        )
        session.add(asset)
        await session.flush()
        manual.source_asset_id = asset.id

    for item in images:
        asset = Asset(
            owner_user_id=owner_user_id,
            kind="manual_page_image",
            storage_key=item.storage_key,
            mime_type=item.image.mime_type,
            byte_size=len(item.image.content),
            sha256=item.image.sha256,
            width=item.image.width,
            height=item.image.height,
        )
        session.add(asset)
        await session.flush()
        session.add(
            ManualPage(
                manual_id=manual.id,
                page_number=item.page_number,
                image_asset_id=asset.id,
                ocr_status="pending",
                text_source="none",
            )
        )

    if source_pdf is not None:
        session.add_all(
            ManualPage(
                manual_id=manual.id,
                page_number=page_number,
                ocr_status="pending",
                text_source="none",
            )
            for page_number in range(1, page_count + 1)
        )

    await session.commit()
    return manual


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
            ManualPage.text_source,
            ManualPage.text_quality,
            ManualPage.ocr_confidence_mean,
            ManualPage.ocr_lines,
        )
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return ManualDetailRow(
        summary=summary_row,
        pages=list(pages_result),
    )


async def get_user_manual_processing_status(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
) -> tuple[Row, list[Row]]:
    """Carga progreso multipágina sin traer líneas OCR pesadas."""
    result = await session.execute(
        select(Manual.id, Manual.status, Manual.page_count).where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
        )
    )
    manual = result.one_or_none()
    if manual is None:
        raise ManualNotFoundError

    pages_result = await session.execute(
        select(
            ManualPage.page_number,
            ManualPage.ocr_status,
            ManualPage.text_quality,
        )
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return manual, list(pages_result)


async def get_manual_for_processing(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> Manual | None:
    """Carga un manual no borrado para el procesador en segundo plano."""
    manual = await session.get(Manual, manual_id)
    if manual is None or manual.deleted_at is not None:
        return None
    return manual


async def list_pages_for_processing(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> list[Row]:
    """Lista páginas en orden con asset de imagen si ya existe."""
    result = await session.execute(
        select(
            ManualPage.id,
            ManualPage.page_number,
            ManualPage.ocr_status,
            Asset.storage_key,
            Asset.mime_type,
            Asset.width,
            Asset.height,
            Asset.sha256,
        )
        .outerjoin(Asset, ManualPage.image_asset_id == Asset.id)
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return list(result)


async def get_asset_for_processing(
    session: AsyncSession,
    *,
    asset_id: UUID,
) -> str | None:
    """Carga un asset activo para el procesador en segundo plano."""
    result = await session.execute(
        select(Asset.storage_key).where(
            Asset.id == asset_id,
            Asset.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def attach_page_image_asset(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    page_id: UUID,
    image: ValidatedManualImage,
    storage_key: str,
) -> None:
    """Asocia a una página PDF la imagen renderizada para OCR/reintentos."""
    page = await session.get(ManualPage, page_id)
    if page is None:
        return

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
    page.image_asset_id = asset.id
    await session.commit()


async def next_chunk_index(session: AsyncSession, *, manual_id: UUID) -> int:
    """Devuelve el siguiente índice global de chunk para un manual."""
    result = await session.execute(
        select(func.coalesce(func.max(ManualChunk.chunk_index) + 1, 0)).where(
            ManualChunk.manual_id == manual_id
        )
    )
    return int(result.scalar_one())


async def replace_page_result(
    session: AsyncSession,
    *,
    manual_id: UUID,
    page_id: UUID,
    ocr_lines: list[dict[str, object]],
    text_source: str,
    text_quality: str,
    ocr_confidence_mean: float | None,
    chunks: list[PreparedChunk],
) -> None:
    """Guarda resultado de una página sin duplicar chunks en reintentos."""
    page = await session.get(ManualPage, page_id)
    if page is None:
        return

    await session.execute(delete(ManualChunk).where(ManualChunk.page_id == page_id))
    page.ocr_lines = ocr_lines
    page.ocr_status = "completed"
    page.text_source = text_source
    page.text_quality = text_quality
    page.ocr_confidence_mean = ocr_confidence_mean
    session.add_all(
        ManualChunk(
            manual_id=manual_id,
            page_id=page_id,
            chunk_index=chunk.chunk_index,
            text=chunk.text,
            source_page=chunk.source_page,
            content_hash=chunk.content_hash,
        )
        for chunk in chunks
    )
    await session.commit()


async def mark_page_failed(session: AsyncSession, *, page_id: UUID) -> None:
    """Marca una página como fallida sin tumbar el resto del manual."""
    page = await session.get(ManualPage, page_id)
    if page is None:
        return
    page.ocr_status = "failed"
    await session.commit()


async def list_manual_chunks_for_ingest(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> list[ManualChunk]:
    """Carga chunks persistidos en orden para enviarlos a RAG."""
    result = await session.execute(
        select(ManualChunk)
        .where(ManualChunk.manual_id == manual_id)
        .order_by(ManualChunk.chunk_index.asc())
    )
    return list(result.scalars())


async def resolve_manual_processed_status(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> str:
    """Calcula estado final antes de marcar indexado."""
    chunks_result = await session.execute(
        select(ManualChunk.id).where(ManualChunk.manual_id == manual_id).limit(1)
    )
    if chunks_result.scalar_one_or_none() is None:
        return "failed"

    result = await session.execute(
        select(ManualPage.ocr_status, ManualPage.text_quality).where(
            ManualPage.manual_id == manual_id
        )
    )
    for row in result:
        if row.ocr_status == "failed" or row.text_quality == "low_confidence":
            return "pending_review"
    return "active"


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

    page_asset_ids = select(ManualPage.image_asset_id).where(
        ManualPage.manual_id == manual_id,
        ManualPage.image_asset_id.is_not(None),
    )
    assets_result = await session.execute(
        select(Asset).where(
            Asset.deleted_at.is_(None),
            or_(
                Asset.id == manual.source_asset_id,
                Asset.id.in_(page_asset_ids),
            ),
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
    status: str = "active",
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

    manual.status = status
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
