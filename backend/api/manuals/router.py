"""Endpoints de manuales persistidos."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Form, Query, status

from api.annotations import DbSession, HttpClient, ImageUpload
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.games.dependencies import ValidGameFormId
from api.manuals.repository import get_user_manual_detail, list_user_manuals
from api.manuals.schemas import (
    ManualCreatedResponse,
    ManualDetailResponse,
    ManualListResponse,
    ManualSummaryResponse,
)
from api.manuals.service import create_manual, delete_manual
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


@router.post(
    "/api/manuals",
    status_code=status.HTTP_201_CREATED,
    responses={
        **GAME_NOT_FOUND_RESPONSE,
        **IMAGE_TOO_LARGE_RESPONSE,
        **INVALID_IMAGE_RESPONSE,
        422: {"description": "El manual no contiene texto indexable."},
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
async def create_manual_handler(
    auth: CurrentAuth,
    game_id: ValidGameFormId,
    image: ImageUpload,
    session: DbSession,
    client: HttpClient,
    _csrf: CsrfProtection,
    title: ManualTitle = None,
    visibility: ManualVisibility = "private",
    language: ManualLanguage = None,
) -> ManualCreatedResponse:
    """Crea un manual en Postgres y luego lo indexa en Chroma."""
    return await create_manual(
        session,
        auth=auth,
        game_id=game_id,
        title=title,
        visibility=visibility,
        language=language,
        image=image,
        client=client,
    )


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
