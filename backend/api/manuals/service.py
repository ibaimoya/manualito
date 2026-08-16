"""Casos de uso de manuales persistidos."""

import logging
from collections.abc import Mapping, Sequence
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path, PurePath
from uuid import UUID

import anyio
import httpx
from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.assets.storage import (
    AssetWriteBatch,
    LocalAssetStore,
    delete_stored_file,
    stored_file_path,
)
from api.auth.audit import record_security_event
from api.auth.service import AuthenticatedSession
from api.exceptions import (
    ApiError,
    InternalServiceError,
    InvalidPdfError,
    ManualPageLimitExceededError,
)
from api.games import repository as games_repository
from api.manuals.dto import (
    ManualPageForProcessing,
    PageEditResult,
    PreparedChunk,
    ReconciliationPlan,
    StoredManualImage,
    StoredManualPdf,
    ValidatedManualImage,
)
from api.manuals.exceptions import (
    AssetStorageUnavailableError,
    ManualBusyError,
    ManualContextNotFoundError,
    ManualDuplicateError,
    ManualNotEditableError,
    ManualsError,
    ManualTooLargeError,
    ManualUploadSelectionError,
)
from api.manuals.locks import manual_lock
from api.manuals.pdf import extract_pdf_page_text, pdf_text_is_usable, render_pdf_page
from api.manuals.repository import (
    INDEXED_MANUAL_STATUSES,
    asset_storage_prefix_is_referenced,
    attach_page_image_asset,
    begin_manual_reprocessing,
    claim_page_for_processing,
    create_manual_with_pending_pages,
    find_reusable_page_result,
    get_asset_for_processing,
    get_manual_for_processing,
    get_manual_page_detail,
    get_page_for_edit,
    get_page_for_processing,
    list_alive_manual_ids,
    list_expected_chunk_ids,
    list_manual_chunks_for_ingest,
    list_manual_ids_pending_dispatch,
    list_page_chunk_ids,
    list_page_chunks_for_ingest,
    list_pending_page_ids_for_processing,
    manual_has_unfinished_pages,
    mark_manual_failed,
    mark_manual_indexed,
    mark_page_chunks_indexed,
    mark_page_failed,
    mark_stale_processing_pages_failed,
    replace_page_result,
    resolve_manual_processed_status,
    soft_delete_user_manual,
)
from api.manuals.schemas import ManualCreatedResponse
from api.manuals.validation import validate_manual_image, validate_manual_pdf
from api.ocr.service import run_ocr
from common.crypto import sha256_hex
from common.logging import safe_for_log
from common.manual_text.chunking import chunk_text
from common.manual_text.normalizer import normalize_ocr_lines
from database.models.manual import Manual, ManualChunk
from database.session import get_sessionmaker

RAG_INDEX_INTERNAL_DETAIL = "Error interno al indexar el manual."
MANUAL_CHUNK_INDEX_PAGE_STRIDE = 1_000_000
MANUAL_SOURCE_FINGERPRINT_UNIQUE_INDEX = "uq_manuals_live_source_fingerprint"

logger = logging.getLogger(__name__)


def _internal_http_client() -> httpx.AsyncClient:
    """Cliente para servicios internos usados por tasks de manuales."""
    request_timeout = max(config.OCR_SERVICE_TIMEOUT, config.INTERNAL_JSON_TIMEOUT)
    return httpx.AsyncClient(
        timeout=httpx.Timeout(request_timeout, connect=min(10.0, request_timeout))
    )


def _normalize_optional_text(value: str | None) -> str | None:
    """Elimina espacios y representa el texto vacío como ausencia de valor."""
    normalized = (value or "").strip()
    return normalized or None


async def _adopt_committed_batch_safely(batch: AssetWriteBatch) -> None:
    """Adopta un lote confirmado sin interrumpir la respuesta ya persistida."""
    with anyio.CancelScope(shield=True):
        try:
            await batch.adopt()
        except (OSError, ValueError):
            logger.warning(
                "El manual se ha confirmado, pero el marcador del lote sigue pendiente.",
                exc_info=True,
            )


async def _auto_follow_game_after_upload(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> None:
    """Auto-sigue el juego sin invalidar un manual que ya fue confirmado."""
    try:
        await games_repository.auto_follow_game(
            session,
            user_id=user_id,
            game_id=game_id,
        )
    except SQLAlchemyError:
        await session.rollback()
        logger.warning("No se pudo auto-seguir el juego tras subir manual.", exc_info=True)


async def create_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
    title: str | None,
    visibility: str,
    language: str | None,
    images: list[UploadFile] | None,
    pdf: UploadFile | None,
) -> ManualCreatedResponse:
    """Persiste un manual y adopta sus assets solo tras confirmar el commit."""
    batch: AssetWriteBatch | None = None
    try:
        batch = await LocalAssetStore(config.ASSET_STORAGE_DIR).create_manual_batch(
            owner_user_id=auth.user.id
        )
        stored_images, source_pdf, source_type, page_count = await _store_upload(
            batch=batch,
            images=images,
            pdf=pdf,
        )
        source_fingerprint = _manual_source_fingerprint(
            source_type=source_type,
            images=stored_images,
            source_pdf=source_pdf,
        )

        try:
            manual = await create_manual_with_pending_pages(
                session,
                owner_user_id=auth.user.id,
                game_id=game_id,
                title=_normalize_optional_text(title),
                visibility=visibility,
                language=_normalize_optional_text(language),
                source_type=source_type,
                page_count=page_count,
                source_fingerprint=source_fingerprint,
                images=stored_images,
                source_pdf=source_pdf,
            )
            manual_id = manual.id
        except IntegrityError as exc:
            if _is_duplicate_manual_error(exc):
                raise ManualDuplicateError from exc
            raise

    except OSError as exc:
        await _rollback_and_abort(session, batch)
        raise AssetStorageUnavailableError from exc
    except BaseException:
        await _rollback_and_abort(session, batch)
        raise

    try:
        with anyio.CancelScope(shield=True):
            await session.commit()
    except IntegrityError as exc:
        await _rollback_and_abort(session, batch)
        if _is_duplicate_manual_error(exc):
            raise ManualDuplicateError from exc
        raise
    except OSError as exc:
        raise AssetStorageUnavailableError from exc
    except BaseException:
        with anyio.CancelScope(shield=True):
            await session.rollback()
        raise

    await _adopt_committed_batch_safely(batch)
    await _auto_follow_game_after_upload(
        session,
        user_id=auth.user.id,
        game_id=game_id,
    )

    return ManualCreatedResponse(
        manual_id=manual_id,
        game_id=game_id,
        status="indexing",
        visibility=visibility,
        source_type=source_type,
        page_count=page_count,
    )


async def _store_upload(
    *,
    batch: AssetWriteBatch,
    images: list[UploadFile] | None,
    pdf: UploadFile | None,
) -> tuple[list[StoredManualImage], StoredManualPdf | None, str, int]:
    """Valida y guarda la fuente subida antes de crear filas en DB."""
    image_files = images or []
    if bool(image_files) == (pdf is not None):
        await _close_uploads(image_files)
        if pdf is not None and not pdf.file.closed:
            await pdf.close()
        raise ManualUploadSelectionError

    if image_files:
        stored_images = await _store_images(batch=batch, images=image_files)
        return stored_images, None, "images", len(stored_images)

    assert pdf is not None
    validated_pdf = await validate_manual_pdf(pdf, batch=batch)
    if validated_pdf.byte_size > config.MAX_MANUAL_TOTAL_SIZE:
        raise ManualTooLargeError
    storage_key = await batch.promote(
        validated_pdf,
        name="source",
        extension=validated_pdf.extension,
    )
    source_pdf = StoredManualPdf(
        storage_key=storage_key,
        byte_size=validated_pdf.byte_size,
        mime_type=validated_pdf.mime_type,
        extension=validated_pdf.extension,
        page_count=validated_pdf.page_count,
        sha256=validated_pdf.sha256,
    )
    return [], source_pdf, "pdf", source_pdf.page_count


async def _store_images(
    *,
    batch: AssetWriteBatch,
    images: list[UploadFile],
) -> list[StoredManualImage]:
    """Valida y guarda imágenes en orden de página."""
    if len(images) > config.MAX_MANUAL_PAGES:
        await _close_uploads(images)
        raise ManualPageLimitExceededError

    stored: list[StoredManualImage] = []
    total_size = 0
    try:
        for page_number, upload in enumerate(images, start=1):
            image = await validate_manual_image(upload, batch=batch)
            total_size += image.byte_size
            if total_size > config.MAX_MANUAL_TOTAL_SIZE:
                raise ManualTooLargeError
            storage_key = await batch.promote(
                image,
                name=f"page-{page_number}",
                extension=image.extension,
            )
            stored.append(
                StoredManualImage(
                    page_number=page_number,
                    storage_key=storage_key,
                    byte_size=image.byte_size,
                    mime_type=image.mime_type,
                    extension=image.extension,
                    width=image.width,
                    height=image.height,
                    sha256=image.sha256,
                )
            )
    finally:
        await _close_uploads(images)
    return stored


async def _close_uploads(uploads: Sequence[UploadFile]) -> None:
    """Cierra spools que el procesamiento secuencial no haya alcanzado."""
    for upload in uploads:
        if not upload.file.closed:
            await upload.close()


async def _abort_batch_safely(batch: AssetWriteBatch | None) -> None:
    """Limpia un lote precommit sin ocultar la excepción original."""
    if batch is None:
        return
    try:
        await batch.abort()
    except (OSError, ValueError):
        logger.warning("No se pudo limpiar un lote de assets pendiente.", exc_info=True)


async def _rollback_and_abort(
    session: AsyncSession,
    batch: AssetWriteBatch | None,
) -> None:
    """Revierte DB y assets cuando el commit todavía no ha empezado o ha fallado."""
    with anyio.CancelScope(shield=True):
        await session.rollback()
        await _abort_batch_safely(batch)


def _manual_source_fingerprint(
    *,
    source_type: str,
    images: list[StoredManualImage],
    source_pdf: StoredManualPdf | None,
) -> str:
    """Huella estable del origen completo del manual para deduplicar subidas."""
    if source_type == "pdf":
        if source_pdf is None:
            raise ValueError("Un manual PDF necesita asset fuente.")
        return sha256_hex(f"pdf\n{source_pdf.sha256}")
    return sha256_hex("images\n" + "\n".join(item.sha256 for item in images))


def _is_duplicate_manual_error(exc: IntegrityError) -> bool:
    """Detecta la violación del índice único de manual completo."""
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    return constraint == MANUAL_SOURCE_FINGERPRINT_UNIQUE_INDEX or (
        MANUAL_SOURCE_FINGERPRINT_UNIQUE_INDEX in str(exc.orig)
    )


def _parse_rag_ingest_response(response: Mapping[str, object]) -> tuple[set[UUID], str, datetime]:
    """Valida los campos mínimos que API necesita de RAG."""
    chunk_ids = response["chunk_ids"]
    if not isinstance(chunk_ids, list):
        raise TypeError
    int(str(response["chunks_indexed"]))
    return (
        {UUID(str(chunk_id)) for chunk_id in chunk_ids},
        str(response["embedding_model"]),
        datetime.fromisoformat(str(response["indexed_at"])),
    )


async def process_manual(manual_id: UUID) -> list[UUID]:
    """Devuelve las páginas pendientes que debe procesar Celery."""
    async with get_sessionmaker()() as session:
        return await list_pending_page_ids_for_processing(session, manual_id=manual_id)


async def process_manual_page(manual_id: UUID, page_id: UUID) -> None:
    """Procesa una página reclamada de forma idempotente."""
    async with get_sessionmaker()() as session:
        claimed = await claim_page_for_processing(
            session,
            manual_id=manual_id,
            page_id=page_id,
        )
        if not claimed:
            return
        await session.commit()

        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if manual is None or manual.status != "indexing":
            return

        page = await get_page_for_processing(
            session,
            manual_id=manual_id,
            page_id=page_id,
        )
        if page is None:
            return

        source_pdf_path = None
        if manual.source_type == "pdf":
            source_pdf_path = await _read_source_pdf(session, manual)

        async with _internal_http_client() as client:
            if manual.source_type == "pdf":
                await _process_pdf_page(
                    session=session,
                    client=client,
                    manual=manual,
                    page=page,
                    pdf_path=source_pdf_path,
                )
            else:
                await _process_image_page(
                    session=session,
                    client=client,
                    manual=manual,
                    page=page,
                )
        await session.commit()


async def fail_manual_page(manual_id: UUID, page_id: UUID) -> None:
    """Marca una página como fallida cuando Celery corta la ejecución."""
    async with get_sessionmaker()() as session:
        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if manual is None or manual.status != "indexing":
            return
        await mark_page_failed(session, page_id=page_id)
        await session.commit()


async def fail_manual(manual_id: UUID) -> None:
    """Marca el manual como fallido sin ocultar el error de la tarea."""
    try:
        async with get_sessionmaker()() as session:
            await mark_manual_failed(session, manual_id=manual_id)
            await session.commit()
    except SQLAlchemyError:
        logger.warning(
            "No se pudo marcar como fallido el manual '%s'.",
            safe_for_log(str(manual_id)),
            exc_info=True,
        )


async def finalize_manual(manual_id: UUID) -> None:
    """Cierra un manual solo cuando ya no quedan páginas en ejecución."""
    async with manual_lock(manual_id) as session:
        if session is None:
            logger.info(
                "Manual '%s' ya está finalizándose.",
                safe_for_log(str(manual_id)),
            )
            return
        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if manual is None or manual.status != "indexing":
            return
        if await manual_has_unfinished_pages(session, manual_id=manual_id):
            return
        async with _internal_http_client() as client:
            await _finalize_manual_locked(session=session, client=client, manual=manual)


async def _finalize_manual_locked(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual: Manual,
) -> None:
    """Indexa los chunks persistidos y actualiza el estado final del manual."""
    final_status = await resolve_manual_processed_status(session, manual_id=manual.id)
    if final_status == "failed":
        await mark_manual_failed(session, manual_id=manual.id)
        await session.commit()
        return

    chunks = await list_manual_chunks_for_ingest(session, manual_id=manual.id)
    try:
        chunk_ids, embedding_model, indexed_at = _parse_rag_ingest_response(
            await _index_manual_in_rag(
                client=client,
                manual=manual,
                chunks=chunks,
            )
        )
    except ApiError:
        await mark_manual_failed(session, manual_id=manual.id)
        await session.commit()
        raise
    except (KeyError, TypeError, ValueError) as ingest_err:
        await mark_manual_failed(session, manual_id=manual.id)
        await session.commit()
        raise InternalServiceError(RAG_INDEX_INTERNAL_DETAIL) from ingest_err
    await mark_manual_indexed(
        session,
        manual_id=manual.id,
        chunk_ids=chunk_ids,
        embedding_model=embedding_model,
        indexed_at=indexed_at,
        status=final_status,
    )
    await session.commit()


async def _process_image_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual: Manual,
    page: ManualPageForProcessing,
    source_fingerprint_kind: str = "image",
) -> None:
    """Procesa una página que ya tiene imagen en storage."""
    manual_id = manual.id
    if (
        page.storage_key is None
        or page.mime_type is None
        or page.byte_size is None
        or page.width is None
        or page.height is None
        or page.sha256 is None
    ):
        await mark_page_failed(session, page_id=page.id)
        return

    try:
        if await _reuse_page_result(
            session,
            manual=manual,
            page=page,
            source_fingerprint=page.sha256,
            source_fingerprint_kind=source_fingerprint_kind,
        ):
            return

        image_path = stored_file_path(page.storage_key)
        if not image_path.is_file():
            raise OSError("El asset de imagen no existe")
        image = ValidatedManualImage(
            path=image_path,
            byte_size=page.byte_size,
            mime_type=page.mime_type,
            extension=PurePath(page.storage_key).suffix,
            width=page.width,
            height=page.height,
            sha256=page.sha256,
        )

        await _process_validated_image_page(
            session=session,
            client=client,
            manual_id=manual_id,
            page_id=page.id,
            page_number=page.page_number,
            image=image,
            source_fingerprint_kind=source_fingerprint_kind,
        )
    except (ApiError, OSError, SQLAlchemyError, ValueError):
        await session.rollback()
        logger.warning(
            "No se pudo procesar página %d del manual '%s'.",
            page.page_number,
            safe_for_log(str(manual_id)),
            exc_info=True,
        )
        await mark_page_failed(session, page_id=page.id)


async def _process_pdf_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual: Manual,
    page: ManualPageForProcessing,
    pdf_path: Path | None,
) -> None:
    """Procesa una página PDF con texto embebido u OCR de fallback."""
    manual_id = manual.id
    if pdf_path is None:
        await mark_page_failed(session, page_id=page.id)
        return

    try:
        text = await extract_pdf_page_text(pdf_path, page_number=page.page_number)
        if pdf_text_is_usable(text):
            await _ensure_pdf_page_image_asset(
                session=session,
                manual=manual,
                page=page,
                pdf_path=pdf_path,
            )
            await _replace_page_text(
                session,
                manual_id=manual_id,
                page_id=page.id,
                page_number=page.page_number,
                lines=[{"text": text, "confidence": None}],
                text_source="pdf_text",
                confidence_mean=None,
            )
            return

        if page.storage_key is not None:
            await _process_image_page(
                session=session,
                client=client,
                manual=manual,
                page=page,
                source_fingerprint_kind="pdf_render",
            )
            return

        image = await _persist_pdf_page_image(
            session=session,
            manual=manual,
            page=page,
            pdf_path=pdf_path,
        )
        if await _reuse_page_result(
            session,
            manual=manual,
            page=page,
            source_fingerprint=image.sha256,
            source_fingerprint_kind="pdf_render",
        ):
            return

        await _process_validated_image_page(
            session=session,
            client=client,
            manual_id=manual_id,
            page_id=page.id,
            page_number=page.page_number,
            image=image,
            source_fingerprint_kind="pdf_render",
        )
    except (ApiError, ManualsError, OSError, SQLAlchemyError, ValueError):
        await session.rollback()
        logger.warning(
            "No se pudo procesar página PDF %d del manual '%s'.",
            page.page_number,
            safe_for_log(str(manual_id)),
            exc_info=True,
        )
        await mark_page_failed(session, page_id=page.id)


async def _ensure_pdf_page_image_asset(
    *,
    session: AsyncSession,
    manual: Manual,
    page: ManualPageForProcessing,
    pdf_path: Path,
) -> None:
    """Guarda un render de PDF para el visor sin forzar OCR si ya hay texto."""
    manual_id = manual.id
    if page.storage_key is not None:
        return

    try:
        await _persist_pdf_page_image(
            session=session,
            manual=manual,
            page=page,
            pdf_path=pdf_path,
        )
    except (InvalidPdfError, ManualsError, OSError, SQLAlchemyError, ValueError):
        await session.rollback()
        logger.warning(
            "No se pudo guardar imagen para visualizar la página PDF %d del manual '%s'.",
            page.page_number,
            safe_for_log(str(manual_id)),
            exc_info=True,
        )


async def _persist_pdf_page_image(
    *,
    session: AsyncSession,
    manual: Manual,
    page: ManualPageForProcessing,
    pdf_path: Path,
) -> ValidatedManualImage:
    """Publica un render y conserva el lote hasta confirmar su referencia SQL."""
    owner_user_id = manual.owner_user_id
    store = LocalAssetStore(config.ASSET_STORAGE_DIR)
    batch: AssetWriteBatch | None = None
    commit_started = False
    try:
        batch = await store.create_manual_batch(owner_user_id=owner_user_id)
        image = await render_pdf_page(
            pdf_path,
            page_number=page.page_number,
            batch=batch,
        )
        storage_key = await batch.promote(
            image,
            name=f"page-{page.page_number}",
            extension=image.extension,
        )
        image = replace(image, path=store.resolve_file(storage_key))
        with anyio.CancelScope(shield=True):
            await attach_page_image_asset(
                session,
                owner_user_id=owner_user_id,
                page_id=page.id,
                image=image,
                storage_key=storage_key,
                source_fingerprint_kind="pdf_render",
            )
            commit_started = True
            await session.commit()
            try:
                await batch.adopt()
            except (OSError, ValueError):
                logger.warning(
                    "El render se confirmó, pero su lote sigue pendiente.",
                    exc_info=True,
                )
        return image
    except ManualContextNotFoundError:
        with anyio.CancelScope(shield=True):
            await session.rollback()
            await _abort_batch_safely(batch)
        raise
    except BaseException:
        with anyio.CancelScope(shield=True):
            await session.rollback()
            if not commit_started:
                await _abort_batch_safely(batch)
        raise


async def reprocess_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int | None,
) -> list[UUID]:
    """Reclama un manual quieto y devuelve chunks obsoletos para limpiar."""
    try:
        stale_chunk_ids = await begin_manual_reprocessing(
            session,
            owner_user_id=auth.user.id,
            manual_id=manual_id,
            page_number=page_number,
        )
    except BaseException:
        await session.rollback()
        raise
    await session.commit()
    return stale_chunk_ids


async def run_reprocess(manual_id: UUID, stale_chunk_ids: list[UUID]) -> list[UUID]:
    """Limpia el índice obsoleto y relanza el pipeline de procesamiento."""
    async with _internal_http_client() as client:
        await delete_chunks_from_rag(
            client=client,
            manual_id=manual_id,
            chunk_ids=stale_chunk_ids,
        )
    return await process_manual(manual_id)


async def edit_page_text(
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int,
    text: str,
    ip_address: str | None,
) -> PageEditResult:
    """Sustituye a mano el texto de una página privada y la deja lista para reindexar."""
    async with manual_lock(manual_id) as session:
        if session is None:
            raise ManualBusyError
        return await _edit_page_text_locked(
            session=session,
            auth=auth,
            manual_id=manual_id,
            page_number=page_number,
            text=text,
            ip_address=ip_address,
        )


async def _edit_page_text_locked(
    *,
    session: AsyncSession,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int,
    text: str,
    ip_address: str | None,
) -> PageEditResult:
    """Aplica la edición con el lock del manual ya adquirido."""
    context = await get_page_for_edit(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
        page_number=page_number,
    )
    if context.status == "indexing":
        raise ManualBusyError
    if context.visibility != "private":
        raise ManualNotEditableError

    old_chunk_ids = await list_page_chunk_ids(session, page_id=context.page_id)
    await _replace_page_text(
        session,
        manual_id=manual_id,
        page_id=context.page_id,
        page_number=page_number,
        lines=[{"text": text, "confidence": None}],
        text_source="user_edit",
        confidence_mean=None,
    )
    record_security_event(
        session,
        event_type="manual_page_edited",
        success=True,
        ip_address=ip_address,
        user_id=auth.user.id,
        event_data={"manual_id": str(manual_id), "page_number": page_number},
    )
    await session.commit()

    # Postgres ya es la verdad. Chroma es índice derivado y se sincroniza después.
    page_detail = await get_manual_page_detail(session, page_id=context.page_id)
    return PageEditResult(
        page_detail=page_detail,
        page_id=context.page_id,
        stale_chunk_ids=old_chunk_ids,
    )


async def delete_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
) -> list[UUID]:
    """Borra un manual propio de Postgres y devuelve chunks derivados para limpiar."""
    deleted = await soft_delete_user_manual(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
    )
    await session.commit()
    for storage_key in deleted.storage_keys:
        if not await delete_stored_file(storage_key):
            logger.warning(
                "No se pudo borrar un fichero físico del manual '%s'.",
                safe_for_log(str(manual_id)),
            )
    return deleted.chunk_ids


async def _read_source_pdf(session: AsyncSession, manual: Manual) -> Path | None:
    """Carga el PDF original conservado para procesar sus páginas."""
    if manual.source_asset_id is None:
        return None
    storage_key = await get_asset_for_processing(session, asset_id=manual.source_asset_id)
    if storage_key is None:
        return None
    try:
        path = stored_file_path(storage_key)
        return path if path.is_file() else None
    except (OSError, ValueError):
        return None


async def _process_validated_image_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual_id: UUID,
    page_id: UUID,
    page_number: int,
    image: ValidatedManualImage,
    source_fingerprint_kind: str | None = None,
) -> None:
    """Ejecuta OCR sobre una imagen validada y guarda sus chunks."""
    ocr_lines = await run_ocr(
        image=image,
        client=client,
    )
    await _replace_page_text(
        session,
        manual_id=manual_id,
        page_id=page_id,
        page_number=page_number,
        lines=ocr_lines,
        text_source="ocr",
        confidence_mean=_ocr_confidence_mean(ocr_lines),
        source_fingerprint=image.sha256 if source_fingerprint_kind is not None else None,
        source_fingerprint_kind=source_fingerprint_kind,
    )


async def _reuse_page_result(
    session: AsyncSession,
    *,
    manual: Manual,
    page: ManualPageForProcessing,
    source_fingerprint: str,
    source_fingerprint_kind: str,
) -> bool:
    """Copia una página canónica y evita repetir OCR sobre el mismo origen."""
    reusable = await find_reusable_page_result(
        session,
        owner_user_id=manual.owner_user_id,
        game_id=manual.game_id,
        source_fingerprint=source_fingerprint,
        exclude_page_id=page.id,
    )
    if reusable is None:
        return False

    await replace_page_result(
        session,
        manual_id=manual.id,
        page_id=page.id,
        ocr_lines=reusable.ocr_lines,
        text_source=reusable.text_source,
        text_quality=reusable.text_quality or "empty",
        ocr_confidence_mean=reusable.ocr_confidence_mean,
        chunks=_prepare_text_chunks(
            reusable.chunk_texts,
            source_page=page.page_number,
        ),
        source_fingerprint=source_fingerprint,
        source_fingerprint_kind=source_fingerprint_kind,
        source_reused_from_page_id=reusable.page_id,
    )
    logger.info(
        "Página %d del manual '%s' reutilizada desde una huella canónica.",
        page.page_number,
        safe_for_log(str(manual.id)),
    )
    return True


async def _replace_page_text(
    session: AsyncSession,
    *,
    manual_id: UUID,
    page_id: UUID,
    page_number: int,
    lines: list[dict[str, object]],
    text_source: str,
    confidence_mean: float | None,
    source_fingerprint: str | None = None,
    source_fingerprint_kind: str | None = None,
) -> None:
    """Reemplaza texto y chunks de una página de forma idempotente."""
    chunks = _prepare_text_chunks(
        chunk_text(normalize_ocr_lines(lines)),
        source_page=page_number,
    )
    await replace_page_result(
        session,
        manual_id=manual_id,
        page_id=page_id,
        ocr_lines=lines,
        text_source=text_source if chunks else "none",
        text_quality=_text_quality(chunks, confidence_mean),
        ocr_confidence_mean=confidence_mean,
        chunks=chunks,
        source_fingerprint=source_fingerprint,
        source_fingerprint_kind=source_fingerprint_kind,
    )


def _prepare_text_chunks(
    chunks: list[str],
    *,
    source_page: int,
) -> list[PreparedChunk]:
    """Convierte textos de chunk en filas persistibles con índice estable."""
    start_index = (source_page - 1) * MANUAL_CHUNK_INDEX_PAGE_STRIDE
    return [
        PreparedChunk(
            text=chunk,
            chunk_index=start_index + index,
            source_page=source_page,
            content_hash=sha256_hex(chunk),
        )
        for index, chunk in enumerate(chunks)
    ]


def _ocr_confidence_mean(ocr_lines: list[dict[str, object]]) -> float | None:
    """Calcula confianza media ponderada por longitud de línea."""
    weighted_sum = 0.0
    total_weight = 0
    for line in ocr_lines:
        raw_text = line.get("text")
        confidence = line.get("confidence")
        if not isinstance(raw_text, str) or not isinstance(confidence, int | float):
            continue
        text = raw_text.strip()
        if not text:
            continue
        weight = len(text)
        weighted_sum += float(confidence) * weight
        total_weight += weight
    if total_weight == 0:
        return None
    return weighted_sum / total_weight


def _text_quality(chunks: list[PreparedChunk], confidence_mean: float | None) -> str:
    """Clasifica el texto extraído sin mezclarlo con fallo técnico."""
    if not chunks:
        return "empty"
    if confidence_mean is not None and confidence_mean < config.OCR_LOW_CONFIDENCE_THRESHOLD:
        return "low_confidence"
    return "ok"


async def _index_manual_in_rag(
    *,
    client: httpx.AsyncClient,
    manual: Manual,
    chunks: Sequence[ManualChunk],
) -> Mapping[str, object]:
    """Envía a RAG solo chunks ya persistidos en Postgres."""
    return await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/ingest",
        payload={
            "manual_id": str(manual.id),
            "game_id": str(manual.game_id),
            "owner_user_id": str(manual.owner_user_id),
            "language": manual.language,
            "chunks": [
                {
                    "id": str(chunk.id),
                    "text": chunk.text,
                    "chunk_index": chunk.chunk_index,
                    "source_page": chunk.source_page,
                    "content_hash": chunk.content_hash,
                }
                for chunk in chunks
            ],
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail=RAG_INDEX_INTERNAL_DETAIL,
    )


async def delete_chunks_from_rag(
    *,
    client: httpx.AsyncClient,
    manual_id: UUID,
    chunk_ids: list[UUID],
) -> None:
    """Pide a RAG limpiar Chroma sin bloquear la escritura de Postgres."""
    if not chunk_ids:
        return
    try:
        await internal_client.post_json(
            client=client,
            service_name="RAG",
            url=f"{config.RAG_URL}/delete",
            payload={
                "manual_id": str(manual_id),
                "chunk_ids": [str(chunk_id) for chunk_id in chunk_ids],
            },
            unavailable_detail="Servicio RAG no disponible.",
            internal_detail="Error interno al borrar el manual del índice.",
        )
    except ApiError:
        # Postgres es la verdad. Un id huérfano en Chroma se descarta al rehidratar.
        logger.warning(
            "No se pudo limpiar Chroma para manual '%s'.",
            safe_for_log(str(manual_id)),
            exc_info=True,
        )


async def delete_chunks_from_rag_by_ids(manual_id: UUID, chunk_ids: list[UUID]) -> None:
    """Limpia chunks de RAG desde una task sin compartir cliente HTTP."""
    async with _internal_http_client() as client:
        await delete_chunks_from_rag(
            client=client,
            manual_id=manual_id,
            chunk_ids=chunk_ids,
        )


async def sync_page_rag(manual_id: UUID, page_id: UUID, stale_chunk_ids: list[UUID]) -> None:
    """Sincroniza en Chroma los chunks derivados de una página editada."""
    async with get_sessionmaker()() as session:
        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if manual is None:
            return
        chunks = await list_page_chunks_for_ingest(session, page_id=page_id)
        chunk_ids: set[UUID] = set()
        embedding_model = None
        indexed_at = None
        async with _internal_http_client() as client:
            await delete_chunks_from_rag(
                client=client,
                manual_id=manual_id,
                chunk_ids=stale_chunk_ids,
            )
            if chunks:
                chunk_ids, embedding_model, indexed_at = _parse_rag_ingest_response(
                    await _index_manual_in_rag(client=client, manual=manual, chunks=chunks)
                )
        await mark_page_chunks_indexed(
            session,
            manual_id=manual_id,
            chunk_ids=chunk_ids,
            embedding_model=embedding_model,
            indexed_at=indexed_at,
        )
        await session.commit()


async def recover_stale_manual_pages() -> list[UUID]:
    """Marca como fallidas las páginas abandonadas en processing."""
    cutoff = datetime.now(UTC) - timedelta(seconds=config.CELERY_MANUAL_PAGE_HARD_TIME_LIMIT + 300)
    async with get_sessionmaker()() as session:
        manual_ids = await mark_stale_processing_pages_failed(session, cutoff=cutoff)
        await session.commit()
        return manual_ids


async def recover_manuals_pending_dispatch() -> list[UUID]:
    """Recupera manuales confirmados que nunca llegaron a la cola."""
    cutoff = datetime.now(UTC) - timedelta(seconds=config.MANUAL_DISPATCH_RECOVERY_DELAY_SECONDS)
    async with get_sessionmaker()() as session:
        return await list_manual_ids_pending_dispatch(
            session,
            cutoff=cutoff,
            limit=config.MANUAL_DISPATCH_RECOVERY_BATCH_SIZE,
        )


async def reconcile_pending_asset_batches() -> tuple[int, int]:
    """Adopta lotes referenciados y elimina huérfanos expirados."""
    store = LocalAssetStore(config.ASSET_STORAGE_DIR)
    cutoff = datetime.now(UTC) - timedelta(seconds=config.ASSET_PENDING_BATCH_TTL_SECONDS)
    pending_batches = await store.list_pending_batches(older_than=cutoff)
    adopted = 0
    deleted = 0
    async with get_sessionmaker()() as session:
        for batch in pending_batches:
            referenced = await asset_storage_prefix_is_referenced(
                session,
                storage_prefix=batch.storage_prefix,
            )
            await store.reconcile_batch(batch, referenced=referenced)
            if referenced:
                adopted += 1
            else:
                deleted += 1
    return adopted, deleted


def plan_rag_reconciliation(
    *,
    inventory: dict[str, list[str]],
    expected: dict[str, set[str]],
    alive: set[str],
) -> ReconciliationPlan:
    """Construye el plan de reparación de el desfase del índice RAG.

    Args:
        inventory (dict[str, list[str]]): Chunks presentes en el índice por manual.
        expected (dict[str, set[str]]): Chunks que Postgres espera por manual.
        alive (set[str]): Identificadores de todos los manuales vivos.

    Returns:
        ReconciliationPlan: Huérfanos y manuales desincronizados en orden estable.
    """
    orphan_chunk_ids = {
        manual_id: sorted(inventory[manual_id])
        for manual_id in sorted(inventory)
        if manual_id not in alive
    }
    stale_manual_ids = sorted(
        manual_id
        for manual_id, expected_chunk_ids in expected.items()
        if set(inventory.get(manual_id, [])) != expected_chunk_ids
    )
    return ReconciliationPlan(
        orphan_chunk_ids=orphan_chunk_ids,
        stale_manual_ids=stale_manual_ids,
    )


async def reindex_manual(manual_id: UUID) -> None:
    """Reconstruye en RAG el índice de un manual persistido.

    Args:
        manual_id (UUID): Identificador del manual que debe reindexarse.

    Returns:
        None: La operación no devuelve ningún valor.
    """
    async with get_sessionmaker()() as session:
        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if (
            manual is None
            or manual.deleted_at is not None
            or manual.status not in INDEXED_MANUAL_STATUSES
        ):
            return
        chunks = await list_manual_chunks_for_ingest(session, manual_id=manual_id)
        if not chunks:
            return
        try:
            async with _internal_http_client() as client:
                chunk_ids, embedding_model, indexed_at = _parse_rag_ingest_response(
                    await _index_manual_in_rag(
                        client=client,
                        manual=manual,
                        chunks=chunks,
                    )
                )
        except ApiError:
            logger.warning(
                "No se pudo reindexar el manual '%s' en RAG.",
                safe_for_log(str(manual_id)),
                exc_info=True,
            )
            return
        await mark_manual_indexed(
            session,
            manual_id=manual_id,
            chunk_ids=chunk_ids,
            embedding_model=embedding_model,
            indexed_at=indexed_at,
        )
        await session.commit()


async def plan_index_repair() -> ReconciliationPlan:
    """
    Calcula las reparaciones necesarias para sincronizar Postgres y RAG.

    Returns:
        ReconciliationPlan: Huérfanos que borrar y manuales que reindexar.
    """
    try:
        async with _internal_http_client() as client:
            payload = await internal_client.get_json(
                client=client,
                service_name="RAG",
                url=f"{config.RAG_URL}/inventory",
                unavailable_detail="Servicio RAG no disponible.",
                internal_detail="Error interno al consultar el inventario RAG.",
            )
    except ApiError:
        logger.warning(
            "No se pudo consultar el inventario RAG. "
            "Se reintentará en la próxima pasada horaria."
        )
        return ReconciliationPlan(orphan_chunk_ids={}, stale_manual_ids=[])

    async with get_sessionmaker()() as session:
        expected_uuid_chunk_ids = await list_expected_chunk_ids(session)
        alive_uuid_manual_ids = await list_alive_manual_ids(session)

    expected = {
        str(manual_id): {str(chunk_id) for chunk_id in chunk_ids}
        for manual_id, chunk_ids in expected_uuid_chunk_ids.items()
    }
    alive = {str(manual_id) for manual_id in alive_uuid_manual_ids}
    plan = plan_rag_reconciliation(
        inventory=payload["manuals"],
        expected=expected,
        alive=alive,
    )
    orphan_manual_ids = sorted(plan.orphan_chunk_ids)
    stale_manual_ids = sorted(plan.stale_manual_ids)
    logger.info(
        "Informe de sincronización del índice RAG: huérfanos=%d, desfasados=%d, "
        "ids_huérfanos=%s, ids_desfasados=%s",
        len(orphan_manual_ids),
        len(stale_manual_ids),
        orphan_manual_ids,
        stale_manual_ids,
    )
    return plan
