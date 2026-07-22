"""Errores de dominio del flujo de manuales."""

from api.games.exceptions import GameNotFoundError, GameUnavailableError

__all__ = [
    "AssetStorageUnavailableError",
    "GameNotFoundError",
    "GameUnavailableError",
    "GeneratedAnswerTooLongError",
    "ManualBusyError",
    "ManualContextNotFoundError",
    "ManualDuplicateError",
    "ManualNotEditableError",
    "ManualNotFoundError",
    "ManualRequestTooLargeError",
    "ManualTooLargeError",
    "ManualUploadSelectionError",
    "ManualsError",
]


class ManualsError(Exception):
    """Clase base para errores esperados de manuales."""


class AssetStorageUnavailableError(ManualsError):
    """El almacenamiento local no puede aceptar o publicar la subida."""


class ManualUploadSelectionError(ManualsError):
    """La subida no contiene exactamente una fuente de manual."""


class ManualTooLargeError(ManualsError):
    """El conjunto de ficheros del manual supera el límite permitido."""


class ManualRequestTooLargeError(ManualsError):
    """El cuerpo multipart excede el límite defensivo de transporte."""


class ManualNotFoundError(ManualsError):
    """El manual no existe, está borrado o no pertenece al usuario."""


class ManualContextNotFoundError(ManualsError):
    """No hay chunks autorizados para responder la pregunta."""


class ManualDuplicateError(ManualsError):
    """El usuario ya tiene ese manual para el mismo juego."""


class ManualBusyError(ManualsError):
    """El manual está siendo procesado y no admite cambios concurrentes."""


class ManualNotEditableError(ManualsError):
    """El manual está compartido y su texto no puede editarse a mano."""


class GeneratedAnswerTooLongError(ManualsError):
    """El LLM generó una respuesta que no cabe en la tabla de mensajes."""
