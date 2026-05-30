from typing import cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from api.auth.exceptions import (
    AdminRequiredError,
    AuthenticationRequiredError,
    DuplicateIdentityError,
    InvalidCredentialsError,
    InvalidCsrfTokenError,
)
from api.auth.passwords import PasswordValidationError
from api.auth.username import UsernameValidationError


class ApiError(Exception):
    """Clase base abstracta para los errores de dominio del gateway."""


class ImageTooLargeError(ApiError):
    """La imagen subida supera el tamaño máximo permitido por el gateway."""


class InvalidImageError(ApiError):
    """El fichero subido no contiene una imagen válida."""


class InternalServiceUnavailableError(ApiError):
    """Un servicio interno no está disponible."""

    def __init__(self, detail: str):
        self.detail = detail


class InternalResourceNotFoundError(ApiError):
    """Un servicio interno indica que el recurso solicitado no existe."""

    def __init__(self, detail: str):
        self.detail = detail


class InternalServiceError(ApiError):
    """Un servicio interno ha devuelto un error no recuperable."""

    def __init__(self, detail: str):
        self.detail = detail


def validation_exception_handler(_request: Request, _exc: Exception):
    """
    Normaliza las respuestas 422 del gateway.

    Handler puro: traduce la excepción a respuesta HTTP sin loguear. El
    rastro de las peticiones inválidas queda en el access log de Uvicorn.

    Args:
        _request (Request): Petición original.
        _exc (Exception): Error de validación emitido por FastAPI.

    Returns:
        JSONResponse: Mensaje uniforme de parámetros inválidos.
    """
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})


def image_too_large_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=413,
        content={"detail": "La imagen no puede superar 20 MB."},
    )


def invalid_image_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=415,
        content={"detail": "El archivo no es una imagen válida."},
    )


def internal_service_unavailable_handler(
    _request: Request,
    exc: Exception,
):
    error = cast(InternalServiceUnavailableError, exc)
    return JSONResponse(status_code=502, content={"detail": error.detail})


def internal_resource_not_found_handler(
    _request: Request,
    exc: Exception,
):
    error = cast(InternalResourceNotFoundError, exc)
    return JSONResponse(status_code=404, content={"detail": error.detail})


def internal_service_error_handler(_request: Request, exc: Exception):
    error = cast(InternalServiceError, exc)
    return JSONResponse(status_code=500, content={"detail": error.detail})


def authentication_required_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=401, content={"detail": "Autenticación requerida."})


def invalid_credentials_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=401, content={"detail": "Credenciales inválidas."})


def duplicate_identity_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=409, content={"detail": "Email o username no disponible."})


def invalid_csrf_token_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=403, content={"detail": "Token CSRF inválido."})


def auth_validation_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})


def admin_required_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=403,
        content={"detail": "Permisos de administrador requeridos."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del gateway."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ImageTooLargeError, image_too_large_handler)
    app.add_exception_handler(InvalidImageError, invalid_image_handler)
    app.add_exception_handler(
        InternalServiceUnavailableError,
        internal_service_unavailable_handler,
    )
    app.add_exception_handler(
        InternalResourceNotFoundError,
        internal_resource_not_found_handler,
    )
    app.add_exception_handler(InternalServiceError, internal_service_error_handler)
    app.add_exception_handler(AuthenticationRequiredError, authentication_required_handler)
    app.add_exception_handler(InvalidCredentialsError, invalid_credentials_handler)
    app.add_exception_handler(DuplicateIdentityError, duplicate_identity_handler)
    app.add_exception_handler(InvalidCsrfTokenError, invalid_csrf_token_handler)
    app.add_exception_handler(UsernameValidationError, auth_validation_handler)
    app.add_exception_handler(PasswordValidationError, auth_validation_handler)
    app.add_exception_handler(AdminRequiredError, admin_required_handler)
