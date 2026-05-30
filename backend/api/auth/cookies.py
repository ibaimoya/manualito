"""Configuración centralizada de cookies de autenticación."""

from fastapi import Response

from api import config


def set_auth_cookies(
    response: Response,
    *,
    session_token: str,
    csrf_token: str,
) -> None:
    """Escribe cookie HttpOnly de sesión y cookie legible de CSRF."""
    response.set_cookie(
        key=config.AUTH_SESSION_COOKIE_NAME,
        value=session_token,
        max_age=config.AUTH_SESSION_MAX_AGE_SECONDS,
        path="/",
        secure=config.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.set_cookie(
        key=config.AUTH_CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=config.AUTH_SESSION_MAX_AGE_SECONDS,
        path="/",
        secure=config.AUTH_COOKIE_SECURE,
        httponly=False,
        samesite="lax",
    )


def clear_auth_cookies(response: Response) -> None:
    """Elimina las cookies de sesión y CSRF usando los mismos atributos base."""
    response.delete_cookie(
        key=config.AUTH_SESSION_COOKIE_NAME,
        path="/",
        secure=config.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        key=config.AUTH_CSRF_COOKIE_NAME,
        path="/",
        secure=config.AUTH_COOKIE_SECURE,
        httponly=False,
        samesite="lax",
    )

