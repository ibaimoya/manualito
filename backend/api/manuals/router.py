"""Endpoints de manuales persistidos."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, Query, UploadFile, status

from api.annotations import DbSession, HttpClient
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.games.dependencies import ValidGameFormId
from api.manuals.repository import (
    get_user_manual_detail,
    get_user_manual_processing_status,
    list_user_manuals,
)
from api.manuals.schemas import (
    ManualCreatedResponse,
    ManualDetailResponse,
    ManualListResponse,
    ManualProcessingPageResponse,
    ManualProcessingResponse,
    ManualSummaryResponse,
)
from api.manuals.service import create_manual, delete_manual, process_manual
from api.responses import (
    GAME_NOT_FOUND_RESPONSE,
    IMAGE_TOO_LARGE_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    INVALID_IMAGE_RESPONSE,
    MANUAL_NOT_FOUND_RESPONSE,
)

router = APIRouter()

ManualTitle = Annotated[str | None, Form(max_length=255)]
ManualVisibility = Annotated[str, Form(pattern="^(shared|private)$")]
ManualLanguage = Annotated[str | None, Form(max_length=35)]
ManualImagesUpload = Annotated[list[UploadFile] | None, File()]
ManualPdfUpload = Annotated[UploadFile | None, File()]
ManualListLimit = Annotated[int, Query(ge=1, le=100)]
ManualListOffset = Annotated[int, Query(ge=0)]


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
    background_tasks: BackgroundTasks,
    session: DbSession,
    _csrf: CsrfProtection,
    title: ManualTitle = None,
    visibility: ManualVisibility = "private",
    language: ManualLanguage = None,
    images: ManualImagesUpload = None,
    pdf: ManualPdfUpload = None,
) -> ManualCreatedResponse:
    """Acepta un manual y dispara su procesamiento en segundo plano."""
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
    background_tasks.add_task(process_manual, result.manual_id)
    return result


@router.delete(
    "/api/manuals/{manual_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=MANUAL_NOT_FOUND_RESPONSE,
)
async def delete_manual_handler(
    manual_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
    client: HttpClient,
    _csrf: CsrfProtection,
) -> None:
    """Borra un manual propio y sus recursos derivados."""
    await delete_manual(session, auth=auth, manual_id=manual_id, client=client)
