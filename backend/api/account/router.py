"""Endpoints de cuenta y perfil del usuario autenticado."""

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from api import config
from api.account.schemas import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    MeStatsResponse,
    UpdateProfileRequest,
)
from api.account.service import (
    change_password,
    delete_account,
    get_account_stats,
    update_profile,
)
from api.annotations import DbSession, HttpClient
from api.auth.cookies import clear_auth_cookies
from api.auth.dependencies import CsrfProtection, CurrentAuth, client_ip
from api.auth.emails import schedule_verification_email
from api.auth.schemas import AuthMessageResponse, AuthResponse
from api.auth.service import to_public_user
from api.rate_limit import limiter
from api.responses import IDENTITY_UNAVAILABLE_RESPONSE

router = APIRouter()

PASSWORD_CHANGED_DETAIL = "Contraseña actualizada."


@router.get("/api/me/stats")
async def me_stats_handler(
    auth: CurrentAuth,
    session: DbSession,
) -> MeStatsResponse:
    """Devuelve la actividad agregada del usuario para su perfil."""
    return await get_account_stats(session, auth=auth)


@router.patch(
    "/api/me",
    responses=IDENTITY_UNAVAILABLE_RESPONSE,
)
@limiter.limit(config.ACCOUNT_UPDATE_RATE_LIMIT)
async def update_profile_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: UpdateProfileRequest,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> AuthResponse:
    """Edita identidad del perfil; cambiar email exige re-verificarlo."""
    result = await update_profile(
        session,
        auth=auth,
        username=payload.username,
        email=str(payload.email) if payload.email is not None else None,
        avatar_color=payload.avatar_color,
        avatar_figure=payload.avatar_figure,
        ip_address=client_ip(request),
    )
    if result.email_job is not None:
        schedule_verification_email(
            background_tasks,
            to_email=result.email_job.email,
            username=result.email_job.username,
            token=result.email_job.token,
        )
    return AuthResponse(user=to_public_user(result.user), csrf_token=auth.csrf_token)


@router.delete("/api/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(config.ACCOUNT_DELETE_RATE_LIMIT)
async def delete_account_handler(
    request: Request,
    response: Response,
    payload: DeleteAccountRequest,
    session: DbSession,
    auth: CurrentAuth,
    client: HttpClient,
    _csrf: CsrfProtection,
) -> None:
    """Elimina la cuenta y su contenido tras confirmar el propio usuario."""
    await delete_account(
        session,
        auth=auth,
        username_confirmation=payload.username,
        client=client,
        ip_address=client_ip(request),
    )
    clear_auth_cookies(response)


@router.post("/api/me/password")
@limiter.limit(config.PASSWORD_CHANGE_RATE_LIMIT)
async def change_password_handler(
    request: Request,
    payload: ChangePasswordRequest,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> AuthMessageResponse:
    """Cambia la contraseña verificando la actual."""
    await change_password(
        session,
        auth=auth,
        current_password=payload.current_password,
        new_password=payload.new_password,
        ip_address=client_ip(request),
    )
    return AuthMessageResponse(detail=PASSWORD_CHANGED_DETAIL)
