"""Respuestas OpenAPI reutilizables del gateway."""

from typing import Any

from api import config

_MB = 1024 * 1024

type OpenApiResponse = dict[str, Any]
type OpenApiResponses = dict[int | str, OpenApiResponse]


def _format_megabytes(byte_count: int) -> str:
    """Expresa límites configurados en MB para descripciones OpenAPI."""
    return str(byte_count // _MB)


def openapi_response(status_code: int | str, description: str) -> OpenApiResponses:
    """Construye un bloque de respuestas tipado para FastAPI."""
    return {status_code: {"description": description}}


IMAGE_TOO_LARGE_RESPONSE = openapi_response(
    413,
    f"La imagen no puede superar {_format_megabytes(config.MAX_IMAGE_SIZE)} MB.",
)
INVALID_IMAGE_RESPONSE = openapi_response(
    415,
    "El archivo no es una imagen válida.",
)
INTERNAL_ERROR_RESPONSE = openapi_response(
    500,
    "Error interno del gateway.",
)
MANUAL_NOT_FOUND_RESPONSE = openapi_response(
    404,
    "Manual no encontrado.",
)
MANUAL_DUPLICATE_RESPONSE = openapi_response(
    409,
    "Este manual ya está en tu biblioteca.",
)
MANUAL_BUSY_RESPONSE = openapi_response(
    409,
    "El manual se está procesando. Inténtalo en unos segundos.",
)
MANUAL_NOT_EDITABLE_RESPONSE = openapi_response(
    403,
    "Un manual compartido no se puede editar a mano.",
)
GAME_NOT_FOUND_RESPONSE = openapi_response(
    404,
    "Juego no encontrado.",
)
MANUAL_CONTEXT_NOT_FOUND_RESPONSE = openapi_response(
    404,
    "No hay contexto disponible para ese juego.",
)
GAME_UNAVAILABLE_RESPONSE = openapi_response(
    409,
    "Este juego ya no está disponible para nuevas preguntas.",
)
CONVERSATION_NOT_FOUND_RESPONSE = openapi_response(
    404,
    "Conversación no encontrada.",
)
RATING_NOT_FOUND_RESPONSE = openapi_response(
    404,
    "Valoración no encontrada.",
)
IDENTITY_UNAVAILABLE_RESPONSE = openapi_response(
    409,
    "Email o username no disponible.",
)
INTERNAL_SERVICE_UNAVAILABLE_RESPONSE = openapi_response(
    502,
    "Servicio interno no disponible.",
)
GENERATED_ANSWER_TOO_LONG_RESPONSE = openapi_response(
    502,
    "El LLM generó una respuesta demasiado larga.",
)
