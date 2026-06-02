"""Respuestas OpenAPI reutilizables del gateway."""

IMAGE_TOO_LARGE_RESPONSE = {413: {"description": "La imagen no puede superar 20 MB."}}
INVALID_IMAGE_RESPONSE = {415: {"description": "El archivo no es una imagen válida."}}
INTERNAL_ERROR_RESPONSE = {500: {"description": "Error interno del gateway."}}
MANUAL_NOT_FOUND_RESPONSE = {404: {"description": "Manual no encontrado."}}
GAME_NOT_FOUND_RESPONSE = {404: {"description": "Juego no encontrado."}}
INTERNAL_SERVICE_UNAVAILABLE_RESPONSE = {
    502: {"description": "Servicio interno no disponible."}
}
