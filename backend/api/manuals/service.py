"""Casos de uso de manuales persistidos."""

import logging
from datetime import datetime
from pathlib import PurePath
from uuid import UUID

import httpx
from fastapi import BackgroundTasks, UploadFile
from sqlalchemy.engine import Row
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.assets.storage import (
    delete_stored_file,
    read_stored_file,
    save_manual_image,
    save_manual_pdf,
)
from api.auth.audit import record_security_event
from api.auth.service import AuthenticatedSession
from api.exceptions import (
    ApiError,
    InternalServiceError,
    InternalServiceUnavailableError,
    ManualPageLimitExceededError,
)
from api.manuals.exceptions import (
    ManualBusyError,
    ManualNotEditableError,
    ManualTooLargeError,
    ManualUploadSelectionError,
)
from api.manuals.locks import manual_lock
from api.manuals.pdf import extract_pdf_page_text, pdf_text_is_usable, render_pdf_page
from api.manuals.repository import (
    PreparedChunk,
    StoredManualImage,
    StoredManualPdf,
    attach_page_image_asset,
    begin_manual_reprocessing,
    create_manual_with_pending_pages,
    get_asset_for_processing,
    get_manual_for_processing,
    get_manual_page_row,
    get_page_for_edit,
    list_manual_chunks_for_ingest,
    list_page_chunk_ids,
    list_page_chunks_for_ingest,
    list_pages_for_processing,
    mark_manual_failed,
    mark_manual_indexed,
    mark_page_chunks_indexed,
    mark_page_failed,
    next_chunk_index,
    replace_page_result,
    resolve_manual_processed_status,
    soft_delete_user_manual,
)
from api.manuals.schemas import ManualCreatedResponse, ManualPageResponse
from api.manuals.validation import ValidatedManualImage, validate_manual_image, validate_manual_pdf
from api.ocr.service import run_ocr
from common.crypto import sha256_hex
from common.logging import safe_for_log
from common.manual_text.chunking import chunk_text
from common.manual_text.normalizer import normalize_ocr_lines
from database.session import get_sessionmaker

RAG_INDEX_INTERNAL_DETAIL = "Error interno al indexar el manual."
PAGE_TEXT_SAVED_INDEX_PENDING_DETAIL = (
    "El texto se guardó, pero el índice no se pudo actualizar. "
    "Re-procesa el manual para sincronizarlo."
)

logger = logging.getLogger(__name__)


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
    """Persiste un manual en Postgres antes del procesamiento."""
    stored_keys: list[str] = []
    try:
        stored_images, source_pdf, source_type, page_count = await _store_upload(
            owner_user_id=auth.user.id,
            images=images,
            pdf=pdf,
        )
        stored_keys.extend(item.storage_key for item in stored_images)
        if source_pdf is not None:
            stored_keys.append(source_pdf.storage_key)

        manual = await create_manual_with_pending_pages(
            session,
            owner_user_id=auth.user.id,
            game_id=game_id,
            title=(title or "").strip() or None,
            visibility=visibility,
            language=(language or "").strip() or None,
            source_type=source_type,
            page_count=page_count,
            images=stored_images,
            source_pdf=source_pdf,
        )
    except (ApiError, OSError, SQLAlchemyError):
        for storage_key in stored_keys:
            await delete_stored_file(storage_key)
        raise
    return ManualCreatedResponse(
        manual_id=manual.id,
        game_id=game_id,
        status="indexing",
        visibility=visibility,
        source_type=source_type,
        page_count=page_count,
    )


async def _store_upload(
    *,
    owner_user_id: UUID,
    images: list[UploadFile] | None,
    pdf: UploadFile | None,
) -> tuple[list[StoredManualImage], StoredManualPdf | None, str, int]:
    """Valida y guarda la fuente subida antes de crear filas en DB."""
    image_files = images or []
    if bool(image_files) == (pdf is not None):
        raise ManualUploadSelectionError

    if image_files:
        stored_images = await _store_images(owner_user_id=owner_user_id, images=image_files)
        return stored_images, None, "images", len(stored_images)

    assert pdf is not None
    validated_pdf = await validate_manual_pdf(pdf)
    if len(validated_pdf.content) > config.MAX_MANUAL_TOTAL_SIZE:
        raise ManualTooLargeError
    storage_key = await save_manual_pdf(validated_pdf, owner_user_id=owner_user_id)
    source_pdf = StoredManualPdf(pdf=validated_pdf, storage_key=storage_key)
    return [], source_pdf, "pdf", validated_pdf.page_count


async def _store_images(
    *,
    owner_user_id: UUID,
    images: list[UploadFile],
) -> list[StoredManualImage]:
    """Valida y guarda imágenes en orden de página."""
    if len(images) > config.MAX_MANUAL_PAGES:
        raise ManualPageLimitExceededError

    validated = [await validate_manual_image(image) for image in images]
    if sum(len(image.content) for image in validated) > config.MAX_MANUAL_TOTAL_SIZE:
        raise ManualTooLargeError

    stored: list[StoredManualImage] = []
    try:
        for page_number, image in enumerate(validated, start=1):
            storage_key = await save_manual_image(
                image,
                owner_user_id=owner_user_id,
                page_number=page_number,
            )
            stored.append(
                StoredManualImage(
                    page_number=page_number,
                    image=image,
                    storage_key=storage_key,
                )
            )
    except OSError:
        for item in stored:
            await delete_stored_file(item.storage_key)
        raise
    return stored


def _parse_rag_ingest_response(response: dict) -> tuple[set[UUID], str, datetime]:
    """Valida los campos mínimos que API necesita de RAG."""
    int(response["chunks_indexed"])
    return (
        {UUID(chunk_id) for chunk_id in response["chunk_ids"]},
        str(response["embedding_model"]),
        datetime.fromisoformat(str(response["indexed_at"])),
    )


async def process_manual(manual_id: UUID) -> None:
    """Procesa páginas pendientes con recursos propios."""
    try:
        async with manual_lock(manual_id) as session:
            if session is None:
                logger.info(
                    "Manual '%s' ya está siendo procesado.",
                    safe_for_log(str(manual_id)),
                )
                return
            async with httpx.AsyncClient() as client:
                await _process_manual_locked(session=session, client=client, manual_id=manual_id)
    except ApiError:
        raise
    except Exception:
        logger.exception(
            "No se pudo procesar manual '%s'.",
            safe_for_log(str(manual_id)),
        )
        await _mark_manual_failed_safely(manual_id)
        raise


async def _mark_manual_failed_safely(manual_id: UUID) -> None:
    """Marca el manual como fallido sin tapar el error original."""
    try:
        async with get_sessionmaker()() as session:
            await mark_manual_failed(session, manual_id=manual_id)
    except SQLAlchemyError:
        logger.warning(
            "No se pudo marcar como fallido el manual '%s'.",
            safe_for_log(str(manual_id)),
            exc_info=True,
        )


async def _process_manual_locked(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual_id: UUID,
) -> None:
    """Ejecuta el procesamiento con lock y recursos ya adquiridos."""
    manual = await get_manual_for_processing(session, manual_id=manual_id)
    if manual is None or manual.status != "indexing":
        return

    source_pdf_content = None
    if manual.source_type == "pdf":
        source_pdf_content = await _read_source_pdf(session, manual)
    for page in await list_pages_for_processing(session, manual_id=manual_id):
        if page.ocr_status == "completed":
            continue
        if manual.source_type == "pdf" and page.storage_key is None:
            await _process_pdf_page(
                session=session,
                client=client,
                manual=manual,
                page=page,
                pdf_content=source_pdf_content,
            )
        else:
            await _process_image_page(
                session=session,
                client=client,
                manual_id=manual_id,
                page=page,
            )

    final_status = await resolve_manual_processed_status(session, manual_id=manual_id)
    if final_status == "failed":
        await mark_manual_failed(session, manual_id=manual_id)
        return

    chunks = await list_manual_chunks_for_ingest(session, manual_id=manual_id)
    try:
        chunk_ids, embedding_model, indexed_at = _parse_rag_ingest_response(
            await _index_manual_in_rag(
                client=client,
                manual=manual,
                chunks=chunks,
            )
        )
    except ApiError:
        await mark_manual_failed(session, manual_id=manual_id)
        raise
    except (KeyError, TypeError, ValueError) as ingest_err:
        await mark_manual_failed(session, manual_id=manual_id)
        raise InternalServiceError(RAG_INDEX_INTERNAL_DETAIL) from ingest_err
    await mark_manual_indexed(
        session,
        manual_id=manual_id,
        chunk_ids=chunk_ids,
        embedding_model=embedding_model,
        indexed_at=indexed_at,
        status=final_status,
    )


async def _process_image_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual_id: UUID,
    page: Row,
) -> None:
    """Procesa una página que ya tiene imagen en storage."""
    if page.storage_key is None or page.mime_type is None:
        await mark_page_failed(session, page_id=page.id)
        return

    try:
        content = await read_stored_file(page.storage_key)
        image = ValidatedManualImage(
            content=content,
            mime_type=page.mime_type,
            extension=PurePath(page.storage_key).suffix,
            width=page.width or 1,
            height=page.height or 1,
            sha256=page.sha256 or sha256_hex(content),
        )
        await _process_validated_image_page(
            session=session,
            client=client,
            manual_id=manual_id,
            page_id=page.id,
            page_number=page.page_number,
            image=image,
        )
    except (ApiError, OSError, SQLAlchemyError):
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
    manual,
    page: Row,
    pdf_content: bytes | None,
) -> None:
    """Procesa una página PDF con texto embebido u OCR de fallback."""
    if pdf_content is None:
        await mark_page_failed(session, page_id=page.id)
        return

    try:
        text = await extract_pdf_page_text(pdf_content, page_number=page.page_number)
        if pdf_text_is_usable(text):
            await _replace_page_text(
                session,
                manual_id=manual.id,
                page_id=page.id,
                page_number=page.page_number,
                lines=[{"text": text, "confidence": None}],
                text_source="pdf_text",
                confidence_mean=None,
            )
            return

        image = await render_pdf_page(pdf_content, page_number=page.page_number)
        storage_key = await save_manual_image(
            image,
            owner_user_id=manual.owner_user_id,
            page_number=page.page_number,
        )
        try:
            await attach_page_image_asset(
                session,
                owner_user_id=manual.owner_user_id,
                page_id=page.id,
                image=image,
                storage_key=storage_key,
            )
        except SQLAlchemyError:
            await delete_stored_file(storage_key)
            raise

        await _process_validated_image_page(
            session=session,
            client=client,
            manual_id=manual.id,
            page_id=page.id,
            page_number=page.page_number,
            image=image,
        )
    except (ApiError, OSError, SQLAlchemyError):
        await session.rollback()
        logger.warning(
            "No se pudo procesar página PDF %d del manual '%s'.",
            page.page_number,
            safe_for_log(str(manual.id)),
            exc_info=True,
        )
        await mark_page_failed(session, page_id=page.id)


async def reprocess_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int | None,
    background_tasks: BackgroundTasks,
) -> None:
    """Reclama un manual quieto y agenda su reindexado en segundo plano."""
    stale_chunk_ids = await begin_manual_reprocessing(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
        page_number=page_number,
    )
    background_tasks.add_task(_run_reprocess, manual_id, stale_chunk_ids)


async def _run_reprocess(manual_id: UUID, stale_chunk_ids: list[UUID]) -> None:
    """Limpia el índice obsoleto y relanza el pipeline de procesamiento."""
    async with httpx.AsyncClient() as client:
        await delete_chunks_from_rag(
            client=client,
            manual_id=manual_id,
            chunk_ids=stale_chunk_ids,
        )
    await process_manual(manual_id)


async def edit_page_text(
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int,
    text: str,
    client: httpx.AsyncClient,
    ip_address: str | None,
) -> ManualPageResponse:
    """Sustituye a mano el texto de una página privada y la reindexa."""
    async with manual_lock(manual_id) as session:
        if session is None:
            raise ManualBusyError
        return await _edit_page_text_locked(
            session=session,
            client=client,
            auth=auth,
            manual_id=manual_id,
            page_number=page_number,
            text=text,
            ip_address=ip_address,
        )


async def _edit_page_text_locked(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    auth: AuthenticatedSession,
    manual_id: UUID,
    page_number: int,
    text: str,
    ip_address: str | None,
) -> ManualPageResponse:
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

    # Postgres ya es la verdad; Chroma es índice derivado y se sincroniza después.
    await delete_chunks_from_rag(client=client, manual_id=manual_id, chunk_ids=old_chunk_ids)
    chunks = await list_page_chunks_for_ingest(session, page_id=context.page_id)
    chunk_ids: set[UUID] = set()
    embedding_model = None
    indexed_at = None
    if chunks:
        try:
            chunk_ids, embedding_model, indexed_at = _parse_rag_ingest_response(
                await _index_manual_in_rag(client=client, manual=context, chunks=chunks)
            )
        except ApiError as rag_error:
            raise InternalServiceUnavailableError(PAGE_TEXT_SAVED_INDEX_PENDING_DETAIL) from (
                rag_error
            )
        except (KeyError, TypeError, ValueError) as ingest_error:
            raise InternalServiceError(PAGE_TEXT_SAVED_INDEX_PENDING_DETAIL) from ingest_error
    await mark_page_chunks_indexed(
        session,
        manual_id=manual_id,
        chunk_ids=chunk_ids,
        embedding_model=embedding_model,
        indexed_at=indexed_at,
    )

    row = await get_manual_page_row(session, page_id=context.page_id)
    return ManualPageResponse.model_validate(row)


async def delete_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    client: httpx.AsyncClient,
) -> None:
    """Borra un manual propio de Postgres y limpia recursos derivados."""
    deleted = await soft_delete_user_manual(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
    )
    for storage_key in deleted.storage_keys:
        if not await delete_stored_file(storage_key):
            logger.warning(
                "No se pudo borrar un fichero físico del manual '%s'.",
                safe_for_log(str(manual_id)),
            )
    await delete_chunks_from_rag(
        client=client,
        manual_id=deleted.manual_id,
        chunk_ids=deleted.chunk_ids,
    )


async def _read_source_pdf(session: AsyncSession, manual) -> bytes | None:
    """Carga el PDF original conservado para procesar sus páginas."""
    if manual.source_asset_id is None:
        return None
    storage_key = await get_asset_for_processing(session, asset_id=manual.source_asset_id)
    if storage_key is None:
        return None
    try:
        return await read_stored_file(storage_key)
    except OSError:
        return None


async def _process_validated_image_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual_id: UUID,
    page_id: UUID,
    page_number: int,
    image: ValidatedManualImage,
) -> None:
    """Ejecuta OCR sobre una imagen validada y guarda sus chunks."""
    ocr_lines = await run_ocr(
        filename=f"page-{page_number}{image.extension}",
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
    )


async def _replace_page_text(
    session: AsyncSession,
    *,
    manual_id: UUID,
    page_id: UUID,
    page_number: int,
    lines: list[dict[str, object]],
    text_source: str,
    confidence_mean: float | None,
) -> None:
    """Reemplaza texto y chunks de una página de forma idempotente."""
    start_index = await next_chunk_index(session, manual_id=manual_id)
    chunks = _prepare_page_chunks(
        lines,
        source_page=page_number,
        start_index=start_index,
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
    )


def _prepare_page_chunks(
    ocr_lines: list[dict[str, object]],
    *,
    source_page: int,
    start_index: int,
) -> list[PreparedChunk]:
    """Normaliza una página OCR y genera chunks persistibles."""
    text = normalize_ocr_lines(ocr_lines)
    chunks = chunk_text(text)
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
    if (
        confidence_mean is not None
        and confidence_mean < config.OCR_LOW_CONFIDENCE_THRESHOLD
    ):
        return "low_confidence"
    return "ok"


async def _index_manual_in_rag(
    *,
    client: httpx.AsyncClient,
    manual,
    chunks,
) -> dict:
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
        # Postgres es la verdad; un id huérfano en Chroma se descarta al rehidratar.
        logger.warning(
            "No se pudo limpiar Chroma para manual '%s'.",
            safe_for_log(str(manual_id)),
            exc_info=True,
        )
