"""Consultas y escrituras SQL de manuales."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Select, and_, case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from api.manuals.dto import (
    AuthorizedChunk,
    DeletedManualAssets,
    ManualDetail,
    ManualPageDetail,
    ManualPageEditContext,
    ManualPageForProcessing,
    ManualPageImageAsset,
    ManualProcessingPage,
    ManualProcessingStatus,
    ManualSummary,
    PreparedChunk,
    ReusablePageResult,
    StoredManualImage,
    StoredManualPdf,
    ValidatedManualImage,
)
from api.manuals.exceptions import (
    ManualBusyError,
    ManualContextNotFoundError,
    ManualNotFoundError,
)
from database.models.asset import Asset
from database.models.game import Game
from database.models.manual import Manual, ManualChunk, ManualPage

REPROCESSABLE_MANUAL_STATUSES = ("active", "pending_review", "failed")


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
    source_fingerprint: str,
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
        source_fingerprint=source_fingerprint,
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
                source_fingerprint=item.image.sha256,
                source_fingerprint_kind="image",
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


async def find_reusable_page_result(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    game_id: UUID,
    source_fingerprint: str,
    exclude_page_id: UUID | None = None,
) -> ReusablePageResult | None:
    """Busca una página ya OCR-eada que pueda reutilizarse con seguridad."""
    page_query = (
        select(
            ManualPage.id,
            ManualPage.ocr_lines,
            ManualPage.text_source,
            ManualPage.text_quality,
            ManualPage.ocr_confidence_mean,
        )
        .join(Manual, Manual.id == ManualPage.manual_id)
        .where(
            Manual.game_id == game_id,
            Manual.deleted_at.is_(None),
            ManualPage.source_fingerprint == source_fingerprint,
            ManualPage.source_reused_from_page_id.is_(None),
            ManualPage.ocr_status == "completed",
            ManualPage.text_quality.in_(("ok", "empty")),
            or_(
                Manual.owner_user_id == owner_user_id,
                ((Manual.visibility == "shared") & (Manual.status == "active")),
            ),
        )
        .order_by(ManualPage.updated_at.desc())
        .limit(1)
    )
    if exclude_page_id is not None:
        page_query = page_query.where(ManualPage.id != exclude_page_id)

    page_result = await session.execute(page_query)
    page = page_result.one_or_none()
    if page is None:
        return None

    chunks_result = await session.execute(
        select(ManualChunk.text)
        .where(ManualChunk.page_id == page.id)
        .order_by(ManualChunk.chunk_index.asc())
    )
    return ReusablePageResult(
        page_id=page.id,
        ocr_lines=page.ocr_lines,
        text_source=page.text_source,
        text_quality=page.text_quality,
        ocr_confidence_mean=page.ocr_confidence_mean,
        chunk_texts=list(chunks_result.scalars()),
    )


async def list_user_manuals(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    limit: int,
    offset: int,
) -> list[ManualSummary]:
    """Lista manuales propios sin cargar relaciones perezosas."""
    result = await session.execute(_manual_summary_query(owner_user_id).limit(limit).offset(offset))
    return [ManualSummary(**row) for row in result.mappings()]


async def get_user_manual_detail(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
) -> ManualDetail:
    """Carga detalle de manual con ownership embebido en la query."""
    result = await session.execute(
        _manual_summary_query(owner_user_id).where(Manual.id == manual_id)
    )
    summary_row = result.mappings().one_or_none()
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
            Asset.id.is_not(None).label("image_available"),
            Asset.width.label("image_width"),
            Asset.height.label("image_height"),
            _manual_page_dedup_status(),
        )
        .outerjoin(
            Asset,
            and_(
                ManualPage.image_asset_id == Asset.id,
                Asset.kind == "manual_page_image",
                Asset.deleted_at.is_(None),
            ),
        )
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return ManualDetail(
        **summary_row,
        pages=[ManualPageDetail(**row) for row in pages_result.mappings()],
    )


async def get_user_manual_processing_status(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
) -> ManualProcessingStatus:
    """Carga progreso multipágina sin traer líneas OCR pesadas."""
    result = await session.execute(
        select(Manual.id.label("manual_id"), Manual.status, Manual.page_count).where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
        )
    )
    manual = result.mappings().one_or_none()
    if manual is None:
        raise ManualNotFoundError

    pages_result = await session.execute(
        select(
            ManualPage.page_number,
            ManualPage.ocr_status,
            ManualPage.text_quality,
            _manual_page_dedup_status(),
        )
        .where(ManualPage.manual_id == manual_id)
        .order_by(ManualPage.page_number.asc())
    )
    return ManualProcessingStatus(
        **manual,
        pages=[ManualProcessingPage(**row) for row in pages_result.mappings()],
    )


async def get_user_manual_page_image_asset(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
    page_number: int,
) -> ManualPageImageAsset | None:
    """Carga la imagen de una página propia sin exponer storage interno."""
    result = await session.execute(
        select(
            Asset.storage_key,
            Asset.mime_type,
            Asset.byte_size,
            Asset.sha256,
            Asset.width,
            Asset.height,
        )
        .join(ManualPage, ManualPage.image_asset_id == Asset.id)
        .join(Manual, Manual.id == ManualPage.manual_id)
        .where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
            ManualPage.page_number == page_number,
            Asset.kind == "manual_page_image",
            Asset.deleted_at.is_(None),
        )
    )
    row = result.mappings().one_or_none()
    if row is None:
        return None
    return ManualPageImageAsset(**row)


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


async def list_pending_page_ids_for_processing(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> list[UUID]:
    """Lista páginas pendientes de un manual que sigue en procesamiento."""
    result = await session.execute(
        select(ManualPage.id)
        .join(Manual, Manual.id == ManualPage.manual_id)
        .where(
            Manual.id == manual_id,
            Manual.status == "indexing",
            Manual.deleted_at.is_(None),
            ManualPage.ocr_status == "pending",
        )
        .order_by(ManualPage.page_number.asc())
    )
    return list(result.scalars())


async def get_page_for_processing(
    session: AsyncSession,
    *,
    manual_id: UUID,
    page_id: UUID,
) -> ManualPageForProcessing | None:
    """Carga una página concreta con su asset de imagen si ya existe."""
    result = await session.execute(
        select(
            ManualPage.id,
            ManualPage.page_number,
            Asset.storage_key,
            Asset.mime_type,
            Asset.width,
            Asset.height,
            Asset.sha256,
        )
        .outerjoin(Asset, ManualPage.image_asset_id == Asset.id)
        .where(
            ManualPage.id == page_id,
            ManualPage.manual_id == manual_id,
        )
    )
    row = result.mappings().one_or_none()
    if row is None:
        return None
    return ManualPageForProcessing(**row)


async def claim_page_for_processing(
    session: AsyncSession,
    *,
    manual_id: UUID,
    page_id: UUID,
) -> bool:
    """Pasa una página pendiente a processing sin pisar otros workers."""
    result = await session.execute(
        update(ManualPage)
        .where(
            ManualPage.id == page_id,
            ManualPage.manual_id == manual_id,
            ManualPage.ocr_status == "pending",
            ManualPage.manual_id.in_(
                select(Manual.id).where(
                    Manual.id == manual_id,
                    Manual.status == "indexing",
                    Manual.deleted_at.is_(None),
                )
            ),
        )
        .values(ocr_status="processing")
        .returning(ManualPage.id)
    )
    claimed = result.scalar_one_or_none() is not None
    await session.commit()
    return claimed


async def manual_has_unfinished_pages(
    session: AsyncSession,
    *,
    manual_id: UUID,
) -> bool:
    """Indica si quedan páginas pendientes o en ejecución."""
    result = await session.execute(
        select(ManualPage.id)
        .where(
            ManualPage.manual_id == manual_id,
            ManualPage.ocr_status.in_(("pending", "processing")),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def mark_stale_processing_pages_failed(
    session: AsyncSession,
    *,
    cutoff: datetime,
) -> list[UUID]:
    """Falla páginas processing antiguas y devuelve manuales afectados."""
    result = await session.execute(
        update(ManualPage)
        .where(
            ManualPage.ocr_status == "processing",
            ManualPage.updated_at < cutoff,
            ManualPage.manual_id.in_(
                select(Manual.id).where(
                    Manual.status == "indexing",
                    Manual.deleted_at.is_(None),
                )
            ),
        )
        .values(ocr_status="failed")
        .returning(ManualPage.manual_id)
    )
    manual_ids = list(dict.fromkeys(result.scalars()))
    await session.commit()
    return manual_ids


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
    source_fingerprint_kind: str | None = None,
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
    if source_fingerprint_kind is not None:
        page.source_fingerprint = image.sha256
        page.source_fingerprint_kind = source_fingerprint_kind
    await session.commit()


async def begin_manual_reprocessing(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
    page_number: int | None,
) -> list[UUID]:
    """Reclama un manual quieto para reindexar y devuelve chunks obsoletos.

    El UPDATE condicional sobre el estado es la barrera frente a peticiones
    concurrentes: solo una pasa el manual a 'indexing'; el resto recibe 409.
    """
    claim = await session.execute(
        update(Manual)
        .where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
            Manual.status.in_(REPROCESSABLE_MANUAL_STATUSES),
        )
        .values(status="indexing")
        .returning(Manual.id)
    )
    if claim.scalar_one_or_none() is None:
        await session.rollback()
        status_result = await session.execute(
            select(Manual.status).where(
                Manual.id == manual_id,
                Manual.owner_user_id == owner_user_id,
                Manual.deleted_at.is_(None),
            )
        )
        if status_result.scalar_one_or_none() is None:
            raise ManualNotFoundError
        raise ManualBusyError

    page_id: UUID | None = None
    if page_number is not None:
        page_result = await session.execute(
            select(ManualPage.id).where(
                ManualPage.manual_id == manual_id,
                ManualPage.page_number == page_number,
            )
        )
        page_id = page_result.scalar_one_or_none()
        if page_id is None:
            await session.rollback()
            raise ManualNotFoundError

    pages_update = update(ManualPage).where(ManualPage.manual_id == manual_id)
    stale_chunks_query = select(ManualChunk.id).where(ManualChunk.manual_id == manual_id)
    if page_id is not None:
        pages_update = pages_update.where(ManualPage.page_number == page_number)
        stale_chunks_query = select(ManualChunk.id).where(ManualChunk.page_id == page_id)
    await session.execute(
        pages_update.values(
            ocr_status="pending",
            source_reused_from_page_id=None,
        )
    )
    stale_result = await session.execute(stale_chunks_query)
    stale_chunk_ids = list(stale_result.scalars())
    await session.commit()
    return stale_chunk_ids


async def get_page_for_edit(
    session: AsyncSession,
    *,
    owner_user_id: UUID,
    manual_id: UUID,
    page_number: int,
) -> ManualPageEditContext:
    """Carga manual propio y página con ownership embebido en la query."""
    result = await session.execute(
        select(
            Manual.status,
            Manual.visibility,
            ManualPage.id.label("page_id"),
        )
        .join(ManualPage, ManualPage.manual_id == Manual.id)
        .where(
            Manual.id == manual_id,
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
            ManualPage.page_number == page_number,
        )
    )
    row = result.mappings().one_or_none()
    if row is None:
        raise ManualNotFoundError
    return ManualPageEditContext(**row)


async def list_page_chunk_ids(session: AsyncSession, *, page_id: UUID) -> list[UUID]:
    """Lista los chunks actuales de una página para limpiarlos de Chroma."""
    result = await session.execute(select(ManualChunk.id).where(ManualChunk.page_id == page_id))
    return list(result.scalars())


async def list_page_chunks_for_ingest(
    session: AsyncSession,
    *,
    page_id: UUID,
) -> list[ManualChunk]:
    """Carga los chunks persistidos de una página en orden para RAG."""
    result = await session.execute(
        select(ManualChunk)
        .where(ManualChunk.page_id == page_id)
        .order_by(ManualChunk.chunk_index.asc())
    )
    return list(result.scalars())


async def get_manual_page_detail(session: AsyncSession, *, page_id: UUID) -> ManualPageDetail:
    """Relee los campos públicos de una página tras editarla."""
    result = await session.execute(
        select(
            ManualPage.page_number,
            ManualPage.ocr_status,
            ManualPage.text_source,
            ManualPage.text_quality,
            ManualPage.ocr_confidence_mean,
            ManualPage.ocr_lines,
            Asset.id.is_not(None).label("image_available"),
            Asset.width.label("image_width"),
            Asset.height.label("image_height"),
            _manual_page_dedup_status(),
        )
        .outerjoin(
            Asset,
            and_(
                ManualPage.image_asset_id == Asset.id,
                Asset.kind == "manual_page_image",
                Asset.deleted_at.is_(None),
            ),
        )
        .where(ManualPage.id == page_id)
    )
    return ManualPageDetail(**result.mappings().one())


async def mark_page_chunks_indexed(
    session: AsyncSession,
    *,
    manual_id: UUID,
    chunk_ids: set[UUID],
    embedding_model: str | None,
    indexed_at: datetime | None,
) -> None:
    """Sincroniza chunks de una página y recalcula el estado del manual."""
    if chunk_ids:
        result = await session.execute(
            select(ManualChunk).where(
                ManualChunk.manual_id == manual_id,
                ManualChunk.id.in_(chunk_ids),
            )
        )
        for chunk in result.scalars():
            chunk.embedding_model = embedding_model
            chunk.indexed_at = indexed_at

    manual = await session.get(Manual, manual_id)
    if manual is None:
        raise ManualContextNotFoundError

    total_result = await session.execute(
        select(func.count(ManualChunk.id)).where(ManualChunk.manual_id == manual_id)
    )
    manual.chunks_indexed = int(total_result.scalar_one())
    manual.status = await resolve_manual_processed_status(session, manual_id=manual_id)
    if indexed_at is not None:
        manual.indexed_at = indexed_at
    await session.commit()


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
    source_fingerprint: str | None = None,
    source_fingerprint_kind: str | None = None,
    source_reused_from_page_id: UUID | None = None,
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
    page.source_reused_from_page_id = source_reused_from_page_id
    if source_fingerprint is not None:
        page.source_fingerprint = source_fingerprint
        page.source_fingerprint_kind = source_fingerprint_kind
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
        if row.ocr_status in {"pending", "processing"}:
            return "indexing"
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
            manual_id=row.manual_id,
            manual_title=row.manual_title,
            source_page=row.source_page,
            is_own=bool(row.is_own),
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
) -> Select[Any]:
    """Construye la query con ownership y visibilidad embebidos."""
    return (
        select(
            ManualChunk.id,
            ManualChunk.text,
            ManualChunk.content_hash,
            ManualChunk.manual_id,
            Manual.title.label("manual_title"),
            ManualChunk.source_page,
            (Manual.owner_user_id == current_user_id).label("is_own"),
        )
        .join(Manual, Manual.id == ManualChunk.manual_id)
        .where(
            ManualChunk.id.in_(chunk_ids),
            Manual.game_id == game_id,
            Manual.deleted_at.is_(None),
            or_(
                ((Manual.visibility == "shared") & (Manual.status == "active")),
                (
                    (Manual.owner_user_id == current_user_id)
                    & (Manual.status.in_(("active", "pending_review")))
                ),
            ),
        )
    )


def _manual_summary_query(owner_user_id: UUID) -> Select[Any]:
    """Construye el listado base de manuales propios."""
    return (
        select(
            Manual.id,
            Manual.game_id,
            Game.name.label("game_name"),
            Manual.title,
            Manual.status,
            Manual.visibility,
            Manual.source_type,
            Manual.page_count,
            Manual.language,
            Manual.chunks_indexed,
            Manual.created_at,
            Manual.indexed_at,
            select(func.count())
            .select_from(ManualPage)
            .where(
                ManualPage.manual_id == Manual.id,
                ManualPage.source_reused_from_page_id.is_not(None),
            )
            .scalar_subquery()
            .label("duplicate_page_count"),
        )
        .join(Game, Game.id == Manual.game_id)
        .where(
            Manual.owner_user_id == owner_user_id,
            Manual.deleted_at.is_(None),
        )
        .order_by(Manual.created_at.desc(), Manual.id.desc())
    )


def _manual_page_dedup_status() -> ColumnElement[str]:
    """Expone si una página ha reutilizado OCR sin filtrar IDs internos."""
    return case(
        (ManualPage.source_reused_from_page_id.is_not(None), "reused"),
        else_="none",
    ).label("dedup_status")
