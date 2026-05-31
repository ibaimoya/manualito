from collections.abc import Iterable, Mapping, Sequence
from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from api import config
from api.auth.exceptions import (
    AdminRequiredError,
    AuthenticationRequiredError,
    AuthFieldError,
    AuthFormValidationError,
    DuplicateIdentityError,
    InvalidCredentialsError,
    InvalidCsrfTokenError,
)
from api.schemas import ApiErrorResponse, ApiFieldError
from database.models.constants import EMAIL_MAX_LENGTH, USERNAME_MAX_LENGTH

INVALID_DATA_DETAIL = "Datos inválidos."
RATE_LIMITED_DETAIL = "Demasiados intentos. Inténtalo más tarde."
NOT_FOUND_DETAIL = "Recurso no encontrado."
METHOD_NOT_ALLOWED_DETAIL = "Método no permitido."

_MISSING_FIELD_ERRORS = {
    "email": ("email_required", "El email es obligatorio."),
    "username": ("username_required", "El nombre de usuario es obligatorio."),
    "password": ("password_required", "La contraseña es obligatoria."),
}

_TOO_SHORT_FIELD_ERRORS = {
    "username": ("username_required", "El nombre de usuario es obligatorio."),
    "password": (
        "password_too_short",
        f"La contraseña debe tener al menos {config.PASSWORD_MIN_LENGTH} caracteres.",
    ),
}

_TOO_LONG_FIELD_ERRORS = {
    "email": ("email_too_long", f"El email no puede superar {EMAIL_MAX_LENGTH} caracteres."),
    "username": (
        "username_too_long",
        f"El nombre de usuario no puede superar {USERNAME_MAX_LENGTH} caracteres.",
    ),
    "password": (
        "password_too_long",
        f"La contraseña no puede superar {config.PASSWORD_MAX_LENGTH} caracteres.",
    ),
}


class ApiError(Exception):
    """Clase base para los errores de dominio del gateway."""


class ImageTooLargeError(ApiError):
    """La imagen subida supera el tamaño máximo permitido por el gateway."""


class InvalidImageError(ApiError):
    """El fichero subido no contiene una imagen válida."""


class InternalServiceUnavailableError(ApiError):
    """Un servicio interno no está disponible."""

    def __init__(self, detail: str) -> None:
        self.detail = detail


class InternalResourceNotFoundError(ApiError):
    """Un servicio interno indica que el recurso solicitado no existe."""

    def __init__(self, detail: str) -> None:
        self.detail = detail


class InternalServiceError(ApiError):
    """Un servicio interno ha devuelto un error no recuperable."""

    def __init__(self, detail: str) -> None:
        self.detail = detail


def validation_exception_handler(_request: Request, _exc: Exception) -> JSONResponse:
    """
    Normaliza las respuestas 422 del gateway.

    Handler puro: traduce la excepción a respuesta HTTP sin loguear. El
    rastro de las peticiones inválidas queda en el access log de Uvicorn.

    Args:
        _request (Request): Petición original.
        _exc (Exception): Error de validación emitido por FastAPI.

    Returns:
        JSONResponse: Mensaje estable de datos inválidos.
    """
    exc = cast(RequestValidationError, _exc)
    return _api_error_response(
        status_code=422,
        detail=INVALID_DATA_DETAIL,
        errors=_map_request_validation_errors(exc.errors()),
    )


def image_too_large_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=413,
        detail="La imagen no puede superar 20 MB.",
        code="image_too_large",
    )


def invalid_image_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=415,
        detail="El archivo no es una imagen válida.",
        code="invalid_image",
    )


def internal_service_unavailable_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    error = cast(InternalServiceUnavailableError, exc)
    return _coded_api_error_response(
        status_code=502,
        detail=error.detail,
        code="service_unavailable",
    )


def internal_resource_not_found_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    error = cast(InternalResourceNotFoundError, exc)
    return _coded_api_error_response(
        status_code=404,
        detail=error.detail,
        code="resource_not_found",
    )


def internal_service_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    error = cast(InternalServiceError, exc)
    return _coded_api_error_response(
        status_code=500,
        detail=error.detail,
        code="internal_service_error",
    )


def authentication_required_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=401,
        detail="Autenticación requerida.",
        code="authentication_required",
    )


def invalid_credentials_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=401,
        detail="Credenciales inválidas.",
        code="invalid_credentials",
    )


def duplicate_identity_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=409,
        detail="Email o username no disponible.",
        code="identity_unavailable",
    )


def invalid_csrf_token_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=403,
        detail="Token CSRF inválido.",
        code="invalid_csrf_token",
    )


def auth_validation_handler(_request: Request, exc: Exception) -> JSONResponse:
    error = cast(AuthFormValidationError, exc)
    return _api_error_response(
        status_code=422,
        detail=INVALID_DATA_DETAIL,
        errors=_auth_field_errors(error.errors),
    )


def admin_required_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return _coded_api_error_response(
        status_code=403,
        detail="Permisos de administrador requeridos.",
        code="admin_required",
    )


def rate_limit_exceeded_handler(request: Request, _exc: Exception) -> JSONResponse:
    response = _coded_api_error_response(
        status_code=429,
        detail=RATE_LIMITED_DETAIL,
        code="rate_limited",
    )
    return _inject_rate_limit_headers(request, response)


def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Normaliza HTTPException de Starlette/FastAPI al envelope publico."""
    error = cast(StarletteHTTPException, exc)
    if error.status_code == 404:
        return _coded_api_error_response(
            status_code=404,
            detail=NOT_FOUND_DETAIL,
            code="not_found",
            headers=error.headers,
        )
    if error.status_code == 405:
        return _coded_api_error_response(
            status_code=405,
            detail=METHOD_NOT_ALLOWED_DETAIL,
            code="method_not_allowed",
            headers=error.headers,
        )
    return _coded_api_error_response(
        status_code=error.status_code,
        detail="Error HTTP.",
        code="http_error",
        headers=error.headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del gateway."""
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
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
    app.add_exception_handler(AuthFormValidationError, auth_validation_handler)
    app.add_exception_handler(AdminRequiredError, admin_required_handler)


def _api_error_response(
    *,
    status_code: int,
    detail: str,
    errors: Iterable[ApiFieldError] = (),
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Construye respuestas de error con el contrato estable de la API."""
    body = ApiErrorResponse(detail=detail, errors=list(errors))
    return JSONResponse(status_code=status_code, content=body.model_dump(), headers=headers)


def _coded_api_error_response(
    *,
    status_code: int,
    detail: str,
    code: str,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    """Construye un error general con codigo estable y field nulo."""
    return _api_error_response(
        status_code=status_code,
        detail=detail,
        errors=[_field_error(field=None, code=code, message=detail)],
        headers=headers,
    )


def _inject_rate_limit_headers(request: Request, response: JSONResponse) -> JSONResponse:
    """Replica el handler oficial de SlowAPI para conservar sus headers."""
    current_limit = getattr(request.state, "view_rate_limit", None)
    return cast(
        JSONResponse,
        request.app.state.limiter._inject_headers(response, current_limit),
    )


def _field_error(*, field: str | None, code: str, message: str) -> ApiFieldError:
    """Crea un error de campo serializable."""
    return ApiFieldError(field=field, code=code, message=message)


def _auth_field_errors(errors: Iterable[AuthFieldError]) -> list[ApiFieldError]:
    """Traduce errores de dominio de auth al contrato HTTP público."""
    return [
        _field_error(field=error.field, code=error.code, message=error.message)
        for error in errors
    ]


def _map_request_validation_errors(
    raw_errors: Sequence[dict[str, Any]],
) -> list[ApiFieldError]:
    """Convierte errores de Pydantic/FastAPI a códigos propios."""
    return [_map_request_validation_error(error) for error in raw_errors]


def _map_request_validation_error(error: dict[str, Any]) -> ApiFieldError:
    """Mapea un error individual sin exponer detalles internos de Pydantic."""
    error_type = str(error.get("type", ""))
    field = _field_from_loc(error.get("loc", ()))

    if field is None:
        return _field_error(
            field=None,
            code="invalid_request_body",
            message="La petición no tiene un cuerpo JSON válido.",
        )
    if error_type == "extra_forbidden":
        return _field_error(
            field=field,
            code="unexpected_field",
            message="Este campo no está permitido.",
        )
    if error_type == "missing":
        return _mapped_or_generic(field, _MISSING_FIELD_ERRORS)
    if error_type == "string_too_short":
        return _mapped_or_generic(field, _TOO_SHORT_FIELD_ERRORS)
    if error_type == "string_too_long":
        return _mapped_or_generic(field, _TOO_LONG_FIELD_ERRORS)
    if field == "email":
        if _email_input_is_too_long(error):
            return _mapped_or_generic(field, _TOO_LONG_FIELD_ERRORS)
        return _field_error(
            field=field,
            code="email_invalid",
            message="El email no tiene un formato válido.",
        )

    return _field_error(
        field=field,
        code="invalid_request",
        message="El campo no tiene un valor válido.",
    )


def _email_input_is_too_long(error: dict[str, Any]) -> bool:
    """Detecta longitud de email sin exponer el input recibido."""
    received_input = error.get("input")
    return isinstance(received_input, str) and len(received_input) > EMAIL_MAX_LENGTH


def _field_from_loc(loc: object) -> str | None:
    """Extrae el campo de primer nivel dentro del body."""
    if not isinstance(loc, Sequence) or isinstance(loc, str):
        return None
    if len(loc) < 2 or loc[0] != "body" or not isinstance(loc[1], str):
        return None
    return loc[1]


def _mapped_or_generic(
    field: str,
    mapping: dict[str, tuple[str, str]],
) -> ApiFieldError:
    """Usa un código conocido si existe o cae a un error genérico estable."""
    if field in mapping:
        code, message = mapping[field]
        return _field_error(field=field, code=code, message=message)
    return _field_error(
        field=field,
        code="invalid_request",
        message="El campo no tiene un valor válido.",
    )
