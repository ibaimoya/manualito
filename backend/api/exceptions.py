from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
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
    InvalidEmailVerificationTokenError,
    InvalidPasswordResetTokenError,
)
from api.conversations.exceptions import ConversationNotFoundError
from api.manuals.exceptions import (
    GameNotFoundError,
    GameUnavailableError,
    GeneratedAnswerTooLongError,
    ManualContextNotFoundError,
    ManualNotFoundError,
    ManualWithoutTextError,
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
    "content": ("message_required", "El mensaje es obligatorio."),
    "token": ("token_required", "El token es obligatorio."),
}

_TOO_SHORT_FIELD_ERRORS = {
    "username": ("username_required", "El nombre de usuario es obligatorio."),
    "content": ("message_required", "El mensaje es obligatorio."),
    "password": (
        "password_too_short",
        f"La contraseña debe tener al menos {config.PASSWORD_MIN_LENGTH} caracteres.",
    ),
    "token": ("token_required", "El token es obligatorio."),
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
    "content": (
        "message_too_long",
        "El mensaje es demasiado largo.",
    ),
    "token": (
        "token_too_long",
        "El token es demasiado largo.",
    ),
}


class ApiError(Exception):
    """Clase base para los errores de dominio del gateway."""


class PublicDetailApiError(ApiError):
    """Error de dominio con mensaje público seguro para devolver al cliente."""

    def __init__(self, detail: str) -> None:
        self.detail = detail


class ImageTooLargeError(ApiError):
    """La imagen subida supera el tamaño máximo permitido por el gateway."""


class InvalidImageError(ApiError):
    """El fichero subido no contiene una imagen válida."""


class InternalServiceUnavailableError(PublicDetailApiError):
    """Un servicio interno no está disponible."""


class InternalResourceNotFoundError(PublicDetailApiError):
    """Un servicio interno indica que el recurso solicitado no existe."""


class InternalServiceError(PublicDetailApiError):
    """Un servicio interno ha devuelto un error no recuperable."""


ExceptionHandler = Callable[[Request, Exception], JSONResponse]


@dataclass(frozen=True, slots=True)
class ErrorResponseConfig:
    """Configuración pública de una excepción de dominio."""

    status_code: int
    code: str
    detail: str | None = None


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


_DOMAIN_ERROR_CONFIGS: Mapping[type[Exception], ErrorResponseConfig] = {
    ImageTooLargeError: ErrorResponseConfig(
        status_code=413,
        detail="La imagen no puede superar 20 MB.",
        code="image_too_large",
    ),
    InvalidImageError: ErrorResponseConfig(
        status_code=415,
        detail="El archivo no es una imagen válida.",
        code="invalid_image",
    ),
    InternalServiceUnavailableError: ErrorResponseConfig(
        status_code=502,
        code="service_unavailable",
    ),
    InternalResourceNotFoundError: ErrorResponseConfig(
        status_code=404,
        code="resource_not_found",
    ),
    InternalServiceError: ErrorResponseConfig(
        status_code=500,
        code="internal_service_error",
    ),
    AuthenticationRequiredError: ErrorResponseConfig(
        status_code=401,
        detail="Autenticación requerida.",
        code="authentication_required",
    ),
    InvalidCredentialsError: ErrorResponseConfig(
        status_code=401,
        detail="Credenciales inválidas.",
        code="invalid_credentials",
    ),
    DuplicateIdentityError: ErrorResponseConfig(
        status_code=409,
        detail="Email o username no disponible.",
        code="identity_unavailable",
    ),
    InvalidEmailVerificationTokenError: ErrorResponseConfig(
        status_code=400,
        detail="El enlace de verificación no es válido o ha caducado.",
        code="email_verification_token_invalid",
    ),
    InvalidPasswordResetTokenError: ErrorResponseConfig(
        status_code=400,
        detail="El enlace de restablecimiento no es válido o ha caducado.",
        code="password_reset_token_invalid",
    ),
    InvalidCsrfTokenError: ErrorResponseConfig(
        status_code=403,
        detail="Token CSRF inválido.",
        code="invalid_csrf_token",
    ),
    AdminRequiredError: ErrorResponseConfig(
        status_code=403,
        detail="Permisos de administrador requeridos.",
        code="admin_required",
    ),
    GameNotFoundError: ErrorResponseConfig(
        status_code=404,
        detail="Juego no encontrado.",
        code="game_not_found",
    ),
    GameUnavailableError: ErrorResponseConfig(
        status_code=409,
        detail="Este juego ya no está disponible para nuevas preguntas.",
        code="game_unavailable",
    ),
    ManualWithoutTextError: ErrorResponseConfig(
        status_code=422,
        detail="No se pudo extraer texto indexable del manual.",
        code="manual_without_text",
    ),
    ManualNotFoundError: ErrorResponseConfig(
        status_code=404,
        detail="Manual no encontrado.",
        code="manual_not_found",
    ),
    ManualContextNotFoundError: ErrorResponseConfig(
        status_code=404,
        detail="No hay contexto disponible para ese juego.",
        code="manual_context_not_found",
    ),
    GeneratedAnswerTooLongError: ErrorResponseConfig(
        status_code=502,
        detail="El LLM generó una respuesta demasiado larga.",
        code="generated_answer_too_long",
    ),
    ConversationNotFoundError: ErrorResponseConfig(
        status_code=404,
        detail="Conversación no encontrada.",
        code="conversation_not_found",
    ),
}


def domain_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Traduce excepciones de dominio con una tabla explícita."""
    config = _domain_error_config(exc)
    detail = (
        config.detail
        if config.detail is not None
        else cast(PublicDetailApiError, exc).detail
    )
    return _coded_api_error_response(
        status_code=config.status_code,
        detail=detail,
        code=config.code,
    )


def _domain_error_config(exc: Exception) -> ErrorResponseConfig:
    """Busca configuración por clase concreta o ancestros registrados."""
    for exception_type in type(exc).__mro__:
        if exception_type in _DOMAIN_ERROR_CONFIGS:
            return _DOMAIN_ERROR_CONFIGS[exception_type]
    raise TypeError(f"Excepción de dominio no registrada: {type(exc).__name__}")


def auth_validation_handler(_request: Request, exc: Exception) -> JSONResponse:
    error = cast(AuthFormValidationError, exc)
    return _api_error_response(
        status_code=422,
        detail=INVALID_DATA_DETAIL,
        errors=_auth_field_errors(error.errors),
    )


def rate_limit_exceeded_handler(_request: Request, _exc: Exception) -> JSONResponse:
    """Normaliza los límites de SlowAPI sin depender de sus métodos privados."""
    exc = cast(RateLimitExceeded, _exc)
    return _coded_api_error_response(
        status_code=429,
        detail=RATE_LIMITED_DETAIL,
        code="rate_limited",
        headers=_rate_limit_headers(exc),
    )


def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Normaliza HTTPException de Starlette/FastAPI al envelope público."""
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


_EXCEPTION_HANDLERS: tuple[tuple[type[Exception], ExceptionHandler], ...] = (
    (StarletteHTTPException, http_exception_handler),
    (RequestValidationError, validation_exception_handler),
    (RateLimitExceeded, rate_limit_exceeded_handler),
    (AuthFormValidationError, auth_validation_handler),
    *((exception_type, domain_exception_handler) for exception_type in _DOMAIN_ERROR_CONFIGS),
)


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del gateway."""
    for exception_type, handler in _EXCEPTION_HANDLERS:
        app.add_exception_handler(exception_type, handler)


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
    """Construye un error general con código estable y field nulo."""
    return _api_error_response(
        status_code=status_code,
        detail=detail,
        errors=[_field_error(field=None, code=code, message=detail)],
        headers=headers,
    )


def _rate_limit_headers(exc: RateLimitExceeded) -> dict[str, str]:
    """Devuelve headers útiles de backoff sin usar APIs privadas de SlowAPI."""
    rate_limit = exc.limit.limit
    retry_after = max(1, int(rate_limit.get_expiry()))
    return {
        "Retry-After": str(retry_after),
        "RateLimit-Limit": str(rate_limit.amount),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": str(retry_after),
    }


def _field_error(*, field: str | None, code: str, message: str) -> ApiFieldError:
    """Crea un error de campo serializable."""
    return ApiFieldError(field=field, code=code, message=message)


def _auth_field_errors(errors: Iterable[AuthFieldError]) -> list[ApiFieldError]:
    """Traduce errores de dominio de auth al contrato HTTP público."""
    return [
        _field_error(field=error.field, code=error.code, message=error.message) for error in errors
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
