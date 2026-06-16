"""Endpoints de manuales persistidos."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Path, Query, Request, UploadFile, status

from api import config
from api.annotations import DbSession
from api.auth.dependencies import CsrfProtection, CurrentAuth, client_ip
from api.games.dependencies import ValidGameFormId
from api.manuals.repository import (
    get_user_manual_detail,
    get_user_manual_processing_status,
    list_user_manuals,
)
from api.manuals.schemas import (
    EditPageTextRequest,
    ManualCreatedResponse,
    ManualDetailResponse,
    ManualListResponse,
    ManualPageResponse,
    ManualProcessingPageResponse,
    ManualProcessingResponse,
    ManualSummaryResponse,
)
from api.manuals.service import create_manual, delete_manual, edit_page_text, reprocess_manual
from api.rate_limit import limiter
from api.responses import (
    GAME_NOT_FOUND_RESPONSE,
    IMAGE_TOO_LARGE_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    INVALID_IMAGE_RESPONSE,
    MANUAL_BUSY_RESPONSE,
    MANUAL_NOT_EDITABLE_RESPONSE,
    MANUAL_NOT_FOUND_RESPONSE,
)
from api.worker.tasks.manuals import (
    delete_chunks_from_rag_task,
    process_manual_task,
    reprocess_manual_task,
    sync_page_rag_task,
)

router = APIRouter()

ManualTitle = Annotated[str | None, Form(max_length=255)]
ManualVisibility = Annotated[str, Form(pattern="^(shared|private)$")]
ManualLanguage = Annotated[str | None, Form(max_length=35)]
ManualImagesUpload = Annotated[list[UploadFile] | None, File()]
ManualPdfUpload = Annotated[UploadFile | None, File()]
ManualListLimit = Annotated[int, Query(ge=1, le=100)]
ManualListOffset = Annotated[int, Query(ge=0)]
ManualPageNumber = Annotated[int, Path(ge=1)]


@router.get("/api/manuals")
async def list_manuals_handler(
    session: DbSession,
    auth: CurrentAuth,
    limit: ManualListLimit = 50,
    offset: ManualListOffset = 0,
) -> ManualListResponse:
    """Lista los manuales del usuario autenticado."""
    rows = await list_user_manuals(
        session,
        owner_user_id=auth.user.id,
        limit=limit,
        offset=offset,
    )
    return ManualListResponse(
        manuals=[ManualSummaryResponse.model_validate(row) for row in rows],
    )


@router.get(
    "/api/manuals/{manual_id}",
    responses=MANUAL_NOT_FOUND_RESPONSE,
)
async def get_manual_handler(
    manual_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
) -> ManualDetailResponse:
    """Devuelve el detalle de un manual propio."""
    detail = await get_user_manual_detail(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
    )
    return ManualDetailResponse.model_validate(detail)


@router.get(
    "/api/manuals/{manual_id}/processing",
    responses=MANUAL_NOT_FOUND_RESPONSE,
)
async def get_manual_processing_handler(
    manual_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
) -> ManualProcessingResponse:
    """Devuelve progreso ligero para consultas periódicas."""
    return await _processing_response(session, auth=auth, manual_id=manual_id)


@router.post(
    "/api/manuals/{manual_id}/reprocess",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        **MANUAL_NOT_FOUND_RESPONSE,
        **MANUAL_BUSY_RESPONSE,
    },
)
@limiter.limit(config.MANUAL_REPROCESS_RATE_LIMIT)
async def reprocess_manual_handler(
    request: Request,
    auth: CurrentAuth,
    manual_id: UUID,
    session: DbSession,
    _csrf: CsrfProtection,
) -> ManualProcessingResponse:
    """Reindexa un manual quieto de principio a fin."""
    stale_chunk_ids = await reprocess_manual(
        session,
        auth=auth,
        manual_id=manual_id,
        page_number=None,
    )
    reprocess_manual_task.delay(str(manual_id), [str(chunk_id) for chunk_id in stale_chunk_ids])
    return await _processing_response(session, auth=auth, manual_id=manual_id)


@router.post(
    "/api/manuals/{manual_id}/pages/{page_number}/reprocess",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        **MANUAL_NOT_FOUND_RESPONSE,
        **MANUAL_BUSY_RESPONSE,
    },
)
@limiter.limit(config.MANUAL_REPROCESS_RATE_LIMIT)
async def reprocess_manual_page_handler(
    request: Request,
    auth: CurrentAuth,
    manual_id: UUID,
    page_number: ManualPageNumber,
    session: DbSession,
    _csrf: CsrfProtection,
) -> ManualProcessingResponse:
    """Reindexa una sola página, típicamente leída con baja confianza."""
    stale_chunk_ids = await reprocess_manual(
        session,
        auth=auth,
        manual_id=manual_id,
        page_number=page_number,
    )
    reprocess_manual_task.delay(str(manual_id), [str(chunk_id) for chunk_id in stale_chunk_ids])
    return await _processing_response(session, auth=auth, manual_id=manual_id)


@router.post(
    "/api/manuals",
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        **GAME_NOT_FOUND_RESPONSE,
        **IMAGE_TOO_LARGE_RESPONSE,
        **INVALID_IMAGE_RESPONSE,
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
async def create_manual_handler(
    auth: CurrentAuth,
    game_id: ValidGameFormId,
    session: DbSession,
    _csrf: CsrfProtection,
    title: ManualTitle = None,
    visibility: ManualVisibility = "private",
    language: ManualLanguage = None,
    images: ManualImagesUpload = None,
    pdf: ManualPdfUpload = None,
) -> ManualCreatedResponse:
    """Acepta un manual y encola su procesamiento."""
    result = await create_manual(
        session,
        auth=auth,
        game_id=game_id,
        title=title,
        visibility=visibility,
        language=language,
        images=images,
        pdf=pdf,
    )
    process_manual_task.delay(str(result.manual_id))
    return result


@router.put(
    "/api/manuals/{manual_id}/pages/{page_number}/text",
    responses={
        **MANUAL_NOT_FOUND_RESPONSE,
        **MANUAL_NOT_EDITABLE_RESPONSE,
        **MANUAL_BUSY_RESPONSE,
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
@limiter.limit(config.MANUAL_EDIT_RATE_LIMIT)
async def edit_manual_page_text_handler(
    request: Request,
    auth: CurrentAuth,
    manual_id: UUID,
    page_number: ManualPageNumber,
    payload: EditPageTextRequest,
    _csrf: CsrfProtection,
) -> ManualPageResponse:
    """Corrige a mano el texto de una página de un manual privado."""
    result = await edit_page_text(
        auth=auth,
        manual_id=manual_id,
        page_number=page_number,
        text=payload.text,
        ip_address=client_ip(request),
    )
    sync_page_rag_task.delay(
        str(manual_id),
        str(result.page_id),
        [str(chunk_id) for chunk_id in result.stale_chunk_ids],
    )
    return result.response


@router.delete(
    "/api/manuals/{manual_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=MANUAL_NOT_FOUND_RESPONSE,
)
async def delete_manual_handler(
    manual_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> None:
    """Borra un manual propio y encola la limpieza de recursos derivados."""
    chunk_ids = await delete_manual(session, auth=auth, manual_id=manual_id)
    delete_chunks_from_rag_task.delay(str(manual_id), [str(chunk_id) for chunk_id in chunk_ids])


async def _processing_response(
    session: DbSession,
    *,
    auth: CurrentAuth,
    manual_id: UUID,
) -> ManualProcessingResponse:
    """Construye el progreso multipágina de un manual propio."""
    manual, page_rows = await get_user_manual_processing_status(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
    )
    return ManualProcessingResponse(
        manual_id=manual.id,
        status=manual.status,
        page_count=manual.page_count,
        completed_pages=sum(page.ocr_status == "completed" for page in page_rows),
        failed_pages=sum(page.ocr_status == "failed" for page in page_rows),
        pages=[ManualProcessingPageResponse.model_validate(page) for page in page_rows],
    )
