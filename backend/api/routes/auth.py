"""Endpoints de registro, login y sesión actual."""

from fastapi import APIRouter, Request, Response, status

from api.annotations import DbSession
from api.auth.cookies import clear_auth_cookies, set_auth_cookies
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.auth.schemas import AuthResponse, LoginRequest, RegisterRequest, UserPublic
from api.auth.service import login_user, logout_session, register_user, to_public_user
from api.rate_limit import limiter

router = APIRouter()


@router.post(
    "/api/auth/register",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("5/minute")
async def register_handler(
    request: Request,
    payload: RegisterRequest,
    session: DbSession,
) -> UserPublic:
    """Registra un usuario normal sin permitir escalada de rol."""
    user = await register_user(
        session,
        email=str(payload.email),
        username=payload.username,
        password=payload.password,
        ip_address=_client_ip(request),
    )
    return to_public_user(user)


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


def _client_ip(request: Request) -> str | None:
    """IP real del cliente tras el proxy.

    uvicorn (--proxy-headers) reescribe request.client.host desde
    X-Forwarded-For, asi que aquí ya es la IP del cliente, no la de nginx.
    """
    client = request.client
    return client.host if client else None
