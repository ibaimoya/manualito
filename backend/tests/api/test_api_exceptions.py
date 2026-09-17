import json

import pytest
from fastapi.exceptions import RequestValidationError
from limits import RateLimitItemPerMinute
from pydantic import ValidationError
from slowapi.errors import RateLimitExceeded
from slowapi.wrappers import Limit
from starlette.exceptions import HTTPException as StarletteHTTPException

from api.auth.exceptions import (
    AuthFieldError,
    AuthFormValidationError,
    InvalidEmailVerificationTokenError,
    InvalidPasswordResetTokenError,
    PasswordValidationError,
    UsernameValidationError,
)
from api.auth.passwords import validate_password_policy
from api.auth.schemas import RegisterRequest
from api.auth.username import build_username_key, normalize_username
from api.conversations.schemas import RenameConversationRequest, SendMessageRequest
from api.exceptions import (
    ApiError,
    ImageTooLargeError,
    InternalResourceNotFoundError,
    InternalServiceError,
    InternalServiceUnavailableError,
    InvalidImageError,
    InvalidPdfError,
    ManualPageLimitExceededError,
    PdfTooLargeError,
    PublicDetailApiError,
    auth_validation_handler,
    domain_exception_handler,
    http_exception_handler,
    rate_limit_exceeded_handler,
    validation_exception_handler,
)
from api.games.exceptions import GameUnavailableError
from api.manuals.exceptions import (
    AssetStorageUnavailableError,
    GeneratedAnswerTooLongError,
    ManualDuplicateError,
    ManualRequestTooLargeError,
    ManualTooLargeError,
)
from api.manuals.schemas import EditPageTextRequest
from api.ratings.schemas import RateGameRequest


def test_api_exceptions_inherit_from_api_error():
    """Todas las excepciones del gateway heredan de su base de dominio."""
    assert issubclass(ImageTooLargeError, ApiError)
    assert issubclass(InvalidImageError, ApiError)
    assert issubclass(PdfTooLargeError, ApiError)
    assert issubclass(InvalidPdfError, ApiError)
    assert issubclass(ManualPageLimitExceededError, ApiError)
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
            {"type": "string_too_long", "loc": ("body", "content")},
            "content",
            "message_too_long",
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
        (PdfTooLargeError(), 413, "pdf_too_large"),
        (ManualTooLargeError(), 413, "manual_too_large"),
        (ManualRequestTooLargeError(), 413, "manual_request_too_large"),
        (InvalidPdfError(), 415, "invalid_pdf"),
        (ManualPageLimitExceededError(), 413, "manual_too_many_pages"),
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
        (GameUnavailableError(), 409, "game_unavailable"),
        (ManualDuplicateError(), 409, "manual_duplicate"),
        (AssetStorageUnavailableError(), 503, "asset_storage_unavailable"),
        (GeneratedAnswerTooLongError(), 502, "generated_answer_too_long"),
        (
            InvalidEmailVerificationTokenError(),
            400,
            "email_verification_token_invalid",
        ),
        (
            InvalidPasswordResetTokenError(),
            400,
            "password_reset_token_invalid",
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
    ("exception", "detail", "maximum"),
    [
        (ImageTooLargeError(), "La imagen no puede superar 30 MB.", 30),
        (PdfTooLargeError(), "El PDF no puede superar 95 MB.", 95),
        (ManualTooLargeError(), "El manual no puede superar 95 MB.", 95),
        (ManualPageLimitExceededError(), "El manual no puede superar 30 páginas.", 30),
    ],
)
def test_upload_limit_errors_expose_decimal_megabytes_or_pages(exception, detail, maximum):
    """El cliente recibe el límite del mensaje sin analizar la frase española."""
    response = domain_exception_handler(None, exception)

    assert _json_body(response)["detail"] == detail
    assert _json_body(response)["errors"][0]["params"] == {"max": maximum}


def test_domain_exception_handler_accepts_registered_base_subclasses():
    """Una subclase futura reutiliza la configuración pública de su ancestro."""

    class ArchivedGameUnavailableError(GameUnavailableError):
        """Caso futuro que no necesita registro propio."""

    response = domain_exception_handler(None, ArchivedGameUnavailableError())

    body = _json_body(response)
    assert response.status_code == 409
    assert body["errors"][0]["code"] == "game_unavailable"


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
            "params": {},
        }
    ]
    assert response.headers["Retry-After"] == "60"
    assert response.headers["RateLimit-Limit"] == "1"
    assert response.headers["RateLimit-Remaining"] == "0"
    assert response.headers["RateLimit-Reset"] == "60"


def test_rate_limit_handler_omits_backoff_headers_without_limit():
    """Si SlowAPI no aporta límite, no se inventan headers de backoff."""
    exc = _rate_limit_exceeded()
    exc.limit = None

    response = rate_limit_exceeded_handler(None, exc)

    body = _json_body(response)
    assert response.status_code == 429
    assert body["detail"] == "Demasiados intentos. Inténtalo más tarde."
    assert body["errors"][0]["code"] == "rate_limited"
    assert "Retry-After" not in response.headers
    assert "RateLimit-Limit" not in response.headers
    assert "RateLimit-Remaining" not in response.headers
    assert "RateLimit-Reset" not in response.headers


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
            "params": {},
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


@pytest.mark.parametrize(
    ("model", "payload", "field", "code", "params"),
    [
        (
            RegisterRequest,
            {"email": "user@example.com", "username": "reader", "password": "short"},
            "password",
            "password_too_short",
            {"min": 12},
        ),
        (
            RegisterRequest,
            {"email": "user@example.com", "username": "reader", "password": "private" * 20},
            "password",
            "password_too_long",
            {"max": 128},
        ),
        (
            RegisterRequest,
            {
                "email": "a" * 255 + "@example.com",
                "username": "reader",
                "password": "secure-password",
            },
            "email",
            "email_too_long",
            {"max": 254},
        ),
        (
            RegisterRequest,
            {"email": "user@example.com", "username": "u" * 21, "password": "secure-password"},
            "username",
            "username_too_long",
            {"max": 20},
        ),
        (RenameConversationRequest, {"title": "t" * 81}, "title", "title_too_long", {"max": 80}),
        (SendMessageRequest, {"content": "m" * 4001}, "content", "message_too_long", {"max": 4000}),
        (EditPageTextRequest, {"text": "t" * 20001}, "text", "text_too_long", {"max": 20000}),
        (RateGameRequest, {"score": 3, "note": "n" * 121}, "note", "invalid_request", {"max": 120}),
    ],
)
def test_real_pydantic_length_errors_publish_only_numeric_limits(
    model, payload, field, code, params
):
    """Modelos reales producen ctx; el handler publica el límite, nunca el valor recibido."""
    with pytest.raises(ValidationError) as caught:
        model.model_validate(payload)

    errors = [{**error, "loc": ("body", *error["loc"])} for error in caught.value.errors()]
    response = validation_exception_handler(None, RequestValidationError(errors))
    body = _json_body(response)
    error = next(error for error in body["errors"] if error["field"] == field)

    assert response.status_code == 422
    assert error["code"] == code
    assert error["params"] == params
    assert all(type(value) is int for value in error["params"].values())
    assert payload[field] not in body["detail"]
    assert payload[field] not in error["message"]
    assert {"ctx", "input", "type", "url"}.isdisjoint(error)


@pytest.mark.parametrize(
    ("validator", "value", "code", "params"),
    [
        (validate_password_policy, "short", "password_too_short", {"min": 12}),
        (validate_password_policy, "private" * 20, "password_too_long", {"max": 128}),
        (normalize_username, "u" * 21, "username_too_long", {"max": 20}),
        (build_username_key, "u" * 161, "username_key_too_long", {"max": 160}),
    ],
)
def test_real_auth_validators_preserve_limits_through_http_handler(validator, value, code, params):
    """Las validaciones de dominio conservan sus límites al llegar al contrato público."""
    with pytest.raises((PasswordValidationError, UsernameValidationError)) as caught:
        validator(value)

    response = auth_validation_handler(None, caught.value)
    error = _json_body(response)["errors"][0]

    assert response.status_code == 422
    assert error["code"] == code
    assert error["params"] == params


def test_length_parameters_do_not_forward_other_validation_context():
    """La frontera de Pydantic solo admite los dos límites enteros explícitos."""
    response = validation_exception_handler(
        None,
        RequestValidationError(
            [
                {
                    "type": "string_too_long",
                    "loc": ("body", "username"),
                    "input": "private-user-value",
                    "ctx": {"max_length": 20, "min_length": True, "input": "private-context"},
                }
            ]
        ),
    )

    error = _json_body(response)["errors"][0]
    assert error["params"] == {"max": 20}
    assert "private" not in json.dumps(error)


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
