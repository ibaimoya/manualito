"""Respuestas OpenAPI reutilizables del gateway."""

from api import config

_MB = 1024 * 1024


def _format_megabytes(byte_count: int) -> str:
    """Expresa límites configurados en MB para descripciones OpenAPI."""
    return str(byte_count // _MB)


IMAGE_TOO_LARGE_RESPONSE = {
    413: {
        "description": f"La imagen no puede superar {_format_megabytes(config.MAX_IMAGE_SIZE)} MB."
    }
}
INVALID_IMAGE_RESPONSE = {415: {"description": "El archivo no es una imagen válida."}}
INTERNAL_ERROR_RESPONSE = {500: {"description": "Error interno del gateway."}}
MANUAL_NOT_FOUND_RESPONSE = {404: {"description": "Manual no encontrado."}}
MANUAL_BUSY_RESPONSE = {
    409: {"description": "El manual se está procesando. Inténtalo en unos segundos."}
}
MANUAL_NOT_EDITABLE_RESPONSE = {
    403: {"description": "Un manual compartido no se puede editar a mano."}
}
GAME_NOT_FOUND_RESPONSE = {404: {"description": "Juego no encontrado."}}
MANUAL_CONTEXT_NOT_FOUND_RESPONSE = {
    404: {"description": "No hay contexto disponible para ese juego."}
}
GAME_UNAVAILABLE_RESPONSE = {
    409: {"description": "Este juego ya no está disponible para nuevas preguntas."}
}
CONVERSATION_NOT_FOUND_RESPONSE = {404: {"description": "Conversación no encontrada."}}
RATING_NOT_FOUND_RESPONSE = {404: {"description": "Valoración no encontrada."}}
IDENTITY_UNAVAILABLE_RESPONSE = {409: {"description": "Email o username no disponible."}}
INTERNAL_SERVICE_UNAVAILABLE_RESPONSE = {
    502: {"description": "Servicio interno no disponible."}
}
GENERATED_ANSWER_TOO_LONG_RESPONSE = {
    502: {"description": "El LLM generó una respuesta demasiado larga."}
}
