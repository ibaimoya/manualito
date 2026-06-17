"""Casos de uso de manuales persistidos."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import PurePath
from uuid import UUID

import httpx
from fastapi import UploadFile
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
    ManualPageLimitExceededError,
)
from api.games import repository as games_repository
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
    claim_page_for_processing,
    create_manual_with_pending_pages,
    find_reusable_page_result,
    get_asset_for_processing,
    get_manual_for_processing,
    get_manual_page_row,
    get_page_for_edit,
    get_page_for_processing,
    list_manual_chunks_for_ingest,
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
from api.manuals.schemas import ManualCreatedResponse, ManualPageResponse
from api.manuals.validation import ValidatedManualImage, validate_manual_image, validate_manual_pdf
from api.ocr.service import run_ocr
from common.crypto import sha256_hex
from common.logging import safe_for_log
from common.manual_text.chunking import chunk_text
from common.manual_text.normalizer import normalize_ocr_lines
from database.session import get_sessionmaker

RAG_INDEX_INTERNAL_DETAIL = "Error interno al indexar el manual."
MANUAL_CHUNK_INDEX_PAGE_STRIDE = 1_000_000

logger = logging.getLogger(__name__)


def _internal_http_timeout() -> httpx.Timeout:
    """Timeout HTTP suficientemente amplio para OCR/RAG, sin caer en el default de 5 s."""
    request_timeout = max(config.OCR_SERVICE_TIMEOUT, config.INTERNAL_JSON_TIMEOUT)
    return httpx.Timeout(request_timeout, connect=min(10.0, request_timeout))


def _internal_http_client() -> httpx.AsyncClient:
    """Cliente para servicios internos usados por tasks de manuales."""
    return httpx.AsyncClient(timeout=_internal_http_timeout())


@dataclass(frozen=True, slots=True)
class PageEditResult:
    """Resultado de editar una página y trabajo RAG derivado."""

    response: ManualPageResponse
    page_id: UUID
    stale_chunk_ids: list[UUID]


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
        try:
            await games_repository.auto_follow_game(
                session,
                user_id=auth.user.id,
                game_id=game_id,
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.warning("No se pudo auto-seguir el juego tras subir manual.", exc_info=True)
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

        source_pdf_content = None
        if manual.source_type == "pdf":
            source_pdf_content = await _read_source_pdf(session, manual)

        async with _internal_http_client() as client:
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
                    manual=manual,
                    page=page,
                )


async def fail_manual_page(manual_id: UUID, page_id: UUID) -> None:
    """Marca una página como fallida cuando Celery corta la ejecución."""
    async with get_sessionmaker()() as session:
        manual = await get_manual_for_processing(session, manual_id=manual_id)
        if manual is None or manual.status != "indexing":
            return
        await mark_page_failed(session, page_id=page_id)


async def fail_manual(manual_id: UUID) -> None:
    """Marca el manual como fallido sin ocultar el error de la tarea."""
    try:
        async with get_sessionmaker()() as session:
            await mark_manual_failed(session, manual_id=manual_id)
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
    manual,
) -> None:
    """Indexa los chunks persistidos y actualiza el estado final del manual."""
    final_status = await resolve_manual_processed_status(session, manual_id=manual.id)
    if final_status == "failed":
        await mark_manual_failed(session, manual_id=manual.id)
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
        raise
    except (KeyError, TypeError, ValueError) as ingest_err:
        await mark_manual_failed(session, manual_id=manual.id)
        raise InternalServiceError(RAG_INDEX_INTERNAL_DETAIL) from ingest_err
    await mark_manual_indexed(
        session,
        manual_id=manual.id,
        chunk_ids=chunk_ids,
        embedding_model=embedding_model,
        indexed_at=indexed_at,
        status=final_status,
    )


async def _process_image_page(
    *,
    session: AsyncSession,
    client: httpx.AsyncClient,
    manual: Row,
    page: Row,
) -> None:
    """Procesa una página que ya tiene imagen en storage."""
    if page.storage_key is None or page.mime_type is None:
        await mark_page_failed(session, page_id=page.id)
        return

    try:
        if page.sha256 is not None and await _reuse_page_result(
            session,
            manual=manual,
            page=page,
            source_fingerprint=page.sha256,
            source_fingerprint_kind="image",
        ):
            return

        content = await read_stored_file(page.storage_key)
        image = ValidatedManualImage(
            content=content,
            mime_type=page.mime_type,
            extension=PurePath(page.storage_key).suffix,
            width=page.width or 1,
            height=page.height or 1,
            sha256=page.sha256 or sha256_hex(content),
        )
        if page.sha256 is None and await _reuse_page_result(
            session,
            manual=manual,
            page=page,
            source_fingerprint=image.sha256,
            source_fingerprint_kind="image",
        ):
            return

        await _process_validated_image_page(
            session=session,
            client=client,
            manual_id=manual.id,
            page_id=page.id,
            page_number=page.page_number,
            image=image,
            source_fingerprint_kind="image",
        )
    except (ApiError, OSError, SQLAlchemyError):
        await session.rollback()
        logger.warning(
            "No se pudo procesar página %d del manual '%s'.",
            page.page_number,
            safe_for_log(str(manual.id)),
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
        if await _reuse_page_result(
            session,
            manual=manual,
            page=page,
            source_fingerprint=image.sha256,
            source_fingerprint_kind="pdf_render",
        ):
            return

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
                source_fingerprint_kind="pdf_render",
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
            source_fingerprint_kind="pdf_render",
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
) -> list[UUID]:
    """Reclama un manual quieto y devuelve chunks obsoletos para limpiar."""
    return await begin_manual_reprocessing(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
        page_number=page_number,
    )


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

    # Postgres ya es la verdad; Chroma es índice derivado y se sincroniza después.
    row = await get_manual_page_row(session, page_id=context.page_id)
    return PageEditResult(
        response=ManualPageResponse.model_validate(row),
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
    for storage_key in deleted.storage_keys:
        if not await delete_stored_file(storage_key):
            logger.warning(
                "No se pudo borrar un fichero físico del manual '%s'.",
                safe_for_log(str(manual_id)),
            )
    return deleted.chunk_ids


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
    source_fingerprint_kind: str | None = None,
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
        source_fingerprint=image.sha256 if source_fingerprint_kind is not None else None,
        source_fingerprint_kind=source_fingerprint_kind,
    )


async def _reuse_page_result(
    session: AsyncSession,
    *,
    manual: Row,
    page: Row,
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
    chunks = _prepare_page_chunks(
        lines,
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


def _prepare_page_chunks(
    ocr_lines: list[dict[str, object]],
    *,
    source_page: int,
) -> list[PreparedChunk]:
    """Normaliza una página OCR y genera chunks persistibles."""
    text = normalize_ocr_lines(ocr_lines)
    return _prepare_text_chunks(chunk_text(text), source_page=source_page)


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


async def recover_stale_manual_pages() -> list[UUID]:
    """Marca como fallidas las páginas abandonadas en processing."""
    cutoff = datetime.now(UTC) - timedelta(seconds=config.CELERY_MANUAL_PAGE_HARD_TIME_LIMIT + 300)
    async with get_sessionmaker()() as session:
        return await mark_stale_processing_pages_failed(session, cutoff=cutoff)
