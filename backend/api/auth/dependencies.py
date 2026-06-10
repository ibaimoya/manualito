"""Dependencias FastAPI de autenticación y autorización."""

from typing import Annotated

from fastapi import Depends, Header, Request, Response

from api import config
from api.annotations import DbSession
from api.auth.cookies import set_auth_cookies
from api.auth.exceptions import AdminRequiredError, InvalidCsrfTokenError
from api.auth.service import AuthenticatedSession, authenticate_session, validate_csrf_token


async def get_current_auth(
    request: Request,
    response: Response,
    session: DbSession,
) -> AuthenticatedSession:
    """Resuelve la sesión actual desde la cookie HttpOnly."""
    auth = await authenticate_session(
        session,
        session_token=request.cookies.get(config.AUTH_SESSION_COOKIE_NAME),
        csrf_token=request.cookies.get(config.AUTH_CSRF_COOKIE_NAME),
    )
    set_auth_cookies(
        response,
        session_token=auth.session_token,
        csrf_token=auth.csrf_token,
    )
    return auth


CurrentAuth = Annotated[AuthenticatedSession, Depends(get_current_auth)]


def require_csrf(
    auth: CurrentAuth,
    csrf_token: Annotated[str | None, Header(alias=config.AUTH_CSRF_HEADER_NAME)] = None,
) -> None:
    """Exige token CSRF válido para requests autenticadas mutantes."""
    if not validate_csrf_token(auth, csrf_token):
        raise InvalidCsrfTokenError


CsrfProtection = Annotated[None, Depends(require_csrf)]


def require_admin(auth: CurrentAuth) -> AuthenticatedSession:
    """Permite continuar solo a usuarios con rol admin leído desde DB."""
    if auth.user.role != "admin":
        raise AdminRequiredError
    return auth


def client_ip(request: Request) -> str | None:
    """IP real del cliente tras el proxy.

    uvicorn (--proxy-headers) reescribe request.client.host desde
    X-Forwarded-For, así que aquí ya es la IP del cliente, no la de nginx.
    """
    client = request.client
    return client.host if client else None
