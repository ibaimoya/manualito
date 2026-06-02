"""Endpoints de registro, login, sesión y recuperación de cuenta."""

from fastapi import APIRouter, BackgroundTasks, Request, Response, status

from api import config
from api.annotations import DbSession
from api.auth.cookies import clear_auth_cookies, set_auth_cookies
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.auth.emails import schedule_password_reset_email, schedule_verification_email
from api.auth.schemas import (
    AuthMessageResponse,
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendVerificationEmailRequest,
    ResetPasswordRequest,
    UserPublic,
    VerifyEmailRequest,
)
from api.auth.service import (
    login_user,
    logout_session,
    register_user,
    request_email_verification,
    request_password_reset,
    reset_password_with_token,
    to_public_user,
    verify_email_token,
)
from api.rate_limit import limiter

router = APIRouter()

VERIFICATION_EMAIL_SENT_DETAIL = (
    "Si existe una cuenta con ese email, enviaremos un correo de verificación."
)
PASSWORD_RESET_EMAIL_SENT_DETAIL = (
    "Si existe una cuenta con ese email, enviaremos instrucciones de restablecimiento."
)
EMAIL_VERIFIED_DETAIL = "Email verificado."
CREDENTIAL_RESET_DONE_DETAIL = "Contraseña actualizada."


@router.post(
    "/api/auth/register",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def register_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: RegisterRequest,
    session: DbSession,
) -> UserPublic:
    """Registra un usuario normal sin permitir escalada de rol."""
    result = await register_user(
        session,
        email=str(payload.email),
        username=payload.username,
        password=payload.password,
        ip_address=_client_ip(request),
    )
    schedule_verification_email(
        background_tasks,
        to_email=result.user.email,
        username=result.user.username,
        token=result.verification_token,
    )
    return to_public_user(result.user)


@router.post("/api/auth/login")
@limiter.limit("5/minute")
async def login_handler(
    request: Request,
    response: Response,
    payload: LoginRequest,
    session: DbSession,
) -> AuthResponse:
    """Inicia sesión con email o username y emite cookie HttpOnly."""
    result = await login_user(
        session,
        identifier=payload.identifier,
        password=payload.password,
        ip_address=_client_ip(request),
    )
    set_auth_cookies(
        response,
        session_token=result.session_token,
        csrf_token=result.csrf_token,
    )
    return AuthResponse(user=to_public_user(result.user), csrf_token=result.csrf_token)


@router.get("/api/me")
async def me_handler(auth: CurrentAuth) -> AuthResponse:
    """Devuelve el usuario actual con un token CSRF utilizable por el frontend."""
    return AuthResponse(user=to_public_user(auth.user), csrf_token=auth.csrf_token)


@router.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_handler(
    request: Request,
    response: Response,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> None:
    """Revoca la sesión actual y limpia las cookies de auth."""
    await logout_session(session, auth=auth, ip_address=_client_ip(request))
    clear_auth_cookies(response)


@router.post("/api/auth/email/verify")
@limiter.limit(config.AUTH_EMAIL_VERIFY_RATE_LIMIT)
async def verify_email_handler(
    request: Request,
    payload: VerifyEmailRequest,
    session: DbSession,
) -> AuthMessageResponse:
    """Verifica el email de forma soft mediante token opaco."""
    await verify_email_token(session, token=payload.token, ip_address=_client_ip(request))
    return AuthMessageResponse(detail=EMAIL_VERIFIED_DETAIL)


@router.post("/api/auth/email/resend")
@limiter.limit(config.AUTH_EMAIL_RESEND_RATE_LIMIT)
async def resend_verification_email_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: ResendVerificationEmailRequest,
    session: DbSession,
) -> AuthMessageResponse:
    """Reenvía verificación sin revelar si la cuenta existe."""
    email_job = await request_email_verification(
        session,
        email=str(payload.email),
        ip_address=_client_ip(request),
    )
    if email_job is not None:
        schedule_verification_email(
            background_tasks,
            to_email=email_job.email,
            username=email_job.username,
            token=email_job.token,
        )
    return AuthMessageResponse(detail=VERIFICATION_EMAIL_SENT_DETAIL)


@router.post("/api/auth/password/forgot")
@limiter.limit(config.AUTH_PASSWORD_FORGOT_RATE_LIMIT)
async def forgot_password_handler(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: ForgotPasswordRequest,
    session: DbSession,
) -> AuthMessageResponse:
    """Inicia reset de contraseña con respuesta uniforme."""
    email_job = await request_password_reset(
        session,
        email=str(payload.email),
        ip_address=_client_ip(request),
    )
    if email_job is not None:
        schedule_password_reset_email(
            background_tasks,
            to_email=email_job.email,
            username=email_job.username,
            token=email_job.token,
        )
    return AuthMessageResponse(detail=PASSWORD_RESET_EMAIL_SENT_DETAIL)


@router.post("/api/auth/password/reset")
@limiter.limit(config.AUTH_PASSWORD_RESET_RATE_LIMIT)
async def reset_password_handler(
    request: Request,
    payload: ResetPasswordRequest,
    session: DbSession,
) -> AuthMessageResponse:
    """Restablece contraseña con token de un solo uso."""
    await reset_password_with_token(
        session,
        token=payload.token,
        password=payload.password,
        ip_address=_client_ip(request),
    )
    return AuthMessageResponse(detail=CREDENTIAL_RESET_DONE_DETAIL)


def _client_ip(request: Request) -> str | None:
    """IP real del cliente tras el proxy.

    uvicorn (--proxy-headers) reescribe request.client.host desde
    X-Forwarded-For, asi que aquí ya es la IP del cliente, no la de nginx.
    """
    client = request.client
    return client.host if client else None
