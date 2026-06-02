import json

import pytest
from fastapi.exceptions import RequestValidationError
from limits import RateLimitItemPerMinute
from slowapi.errors import RateLimitExceeded
from slowapi.wrappers import Limit
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.auth.exceptions import AuthFieldError, AuthFormValidationError, PasswordValidationError
from api.exceptions import (
    ApiError,
    ImageTooLargeError,
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
    InvalidImageError,
    PublicDetailApiError,
    auth_validation_handler,
    domain_exception_handler,
    http_exception_handler,
    rate_limit_exceeded_handler,
    validation_exception_handler,
)


def test_api_exceptions_inherit_from_api_error():
    """Todas las excepciones del gateway heredan de su base de dominio."""
    assert issubclass(ImageTooLargeError, ApiError)
    assert issubclass(InvalidImageError, ApiError)
    assert issubclass(InternalServiceUnavailableError, ApiError)
    assert issubclass(InternalResourceNotFoundError, ApiError)
    assert issubclass(InternalServiceError, ApiError)
    assert issubclass(InternalServiceUnavailableError, PublicDetailApiError)
    assert issubclass(InternalResourceNotFoundError, PublicDetailApiError)
    assert issubclass(InternalServiceError, PublicDetailApiError)


@pytest.mark.parametrize(
    ("raw_error", "field", "code"),
    [
        ({"type": "missing", "loc": ("body", "email")}, "email", "email_required"),
        (
            {"type": "extra_forbidden", "loc": ("body", "role")},
            "role",
            "unexpected_field",
        ),
        (
            {"type": "value_error", "loc": ("body", "email")},
            "email",
            "email_invalid",
        ),
        (
            {"type": "string_too_short", "loc": ("body", "password")},
            "password",
            "password_too_short",
        ),
        (
            {"type": "string_too_long", "loc": ("body", "username")},
            "username",
            "username_too_long",
        ),
        (
            {"type": "string_type", "loc": ("body", "password")},
            "password",
            "invalid_request",
        ),
    ],
)
def test_request_validation_handler_maps_pydantic_errors_to_public_codes(
    raw_error: dict,
    field: str,
    code: str,
):
    """Los errores de FastAPI no exponen detalles internos al frontend."""
    response = validation_exception_handler(None, RequestValidationError([raw_error]))

    body = _json_body(response)
    assert response.status_code == 422
    assert body["detail"] == "Datos inválidos."
    assert body["errors"][0]["field"] == field
    assert body["errors"][0]["code"] == code
    assert {"input", "type", "url"}.isdisjoint(body["errors"][0])


@pytest.mark.parametrize(
    "loc",
    [
        ("body", 1),  # índice no-str dentro del body
        "body",  # loc no es una secuencia de posiciones
    ],
)
def test_request_validation_handler_maps_invalid_body_to_public_code(loc):
    """Un body inválido no se asocia a un campo concreto."""
    response = validation_exception_handler(
        None,
        RequestValidationError([{"type": "json_invalid", "loc": loc}]),
    )

    body = _json_body(response)
    assert body["errors"][0]["field"] is None
    assert body["errors"][0]["code"] == "invalid_request_body"


@pytest.mark.parametrize(
    ("exception", "status_code", "code"),
    [
        (ImageTooLargeError(), 413, "image_too_large"),
        (InvalidImageError(), 415, "invalid_image"),
        (
            InternalServiceUnavailableError("Servicio OCR no disponible."),
            502,
            "service_unavailable",
        ),
        (
            InternalResourceNotFoundError("Manual no encontrado."),
            404,
            "resource_not_found",
        ),
        (
            InternalServiceError("Error interno al procesar la imagen con OCR."),
            500,
            "internal_service_error",
        ),
    ],
)
def test_operational_handlers_keep_same_error_envelope(
    exception: Exception,
    status_code: int,
    code: str,
):
    """Los errores no-formulario también tienen errors[] y código estable."""
    response = domain_exception_handler(None, exception)

    body = _json_body(response)
    assert response.status_code == status_code
    assert body["errors"][0]["field"] is None
    assert body["errors"][0]["code"] == code


@pytest.mark.parametrize(
    ("status_code", "code", "detail"),
    [
        (404, "not_found", "Recurso no encontrado."),
        (405, "method_not_allowed", "Método no permitido."),
        (418, "http_error", "Error HTTP."),
    ],
)
def test_http_exception_handler_maps_status_to_envelope(
    status_code: int,
    code: str,
    detail: str,
):
    """Los HTTPException de Starlette usan el envelope y conservan sus headers."""
    response = http_exception_handler(
        None,
        StarletteHTTPException(status_code=status_code, headers={"X-Probe": "1"}),
    )

    body = _json_body(response)
    assert response.status_code == status_code
    assert body["detail"] == detail
    assert body["errors"][0]["field"] is None
    assert body["errors"][0]["code"] == code
    assert response.headers["X-Probe"] == "1"


def test_rate_limit_handler_returns_stable_public_envelope():
    """SlowAPI también devuelve el contrato común sin depender de APIs privadas."""
    response = rate_limit_exceeded_handler(None, _rate_limit_exceeded())

    body = _json_body(response)
    assert response.status_code == 429
    assert body["detail"] == "Demasiados intentos. Inténtalo más tarde."
    assert body["errors"] == [
        {
            "field": None,
            "code": "rate_limited",
            "message": "Demasiados intentos. Inténtalo más tarde.",
        }
    ]
    assert response.headers["Retry-After"] == "60"
    assert response.headers["RateLimit-Limit"] == "1"
    assert response.headers["RateLimit-Remaining"] == "0"
    assert response.headers["RateLimit-Reset"] == "60"


def test_auth_validation_handler_serializes_domain_field_errors():
    """Las excepciones de auth conservan field/code al llegar a HTTP."""
    response = auth_validation_handler(
        None,
        PasswordValidationError("password_too_short", "La contraseña es demasiado corta."),
    )

    body = _json_body(response)
    assert response.status_code == 422
    assert body["errors"] == [
        {
            "field": "password",
            "code": "password_too_short",
            "message": "La contraseña es demasiado corta.",
        }
    ]


def test_auth_form_validation_error_accepts_multiple_errors():
    """La base de auth permite agrupar errores sin crear excepciones nuevas."""
    error = AuthFormValidationError(
        [
            AuthFieldError(field="email", code="email_invalid", message="Email inválido."),
            AuthFieldError(
                field="password",
                code="password_too_short",
                message="Contraseña corta.",
            ),
        ]
    )

    assert [field_error.code for field_error in error.errors] == [
        "email_invalid",
        "password_too_short",
    ]


def _json_body(response):
    """Decodifica JSONResponse sin depender de TestClient."""
    return json.loads(response.body)


def _rate_limit_exceeded() -> RateLimitExceeded:
    """Crea la excepción concreta que SlowAPI entrega al handler."""
    limit = Limit(
        RateLimitItemPerMinute(1),
        key_func=lambda: "test-client",
        scope=None,
        per_method=False,
        methods=None,
        error_message=None,
        exempt_when=None,
        cost=1,
        override_defaults=False,
    )
    return RateLimitExceeded(limit)
