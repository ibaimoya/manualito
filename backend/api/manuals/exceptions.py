"""Errores de dominio del flujo de manuales."""

from api.games.exceptions import GameNotFoundError, GameUnavailableError

__all__ = [
    "GameNotFoundError",
    "GameUnavailableError",
    "GeneratedAnswerTooLongError",
    "ManualBusyError",
    "ManualContextNotFoundError",
    "ManualNotEditableError",
    "ManualNotFoundError",
    "ManualTooLargeError",
    "ManualUploadSelectionError",
    "ManualsError",
]


class ManualsError(Exception):
    """Clase base para errores esperados de manuales."""


class ManualUploadSelectionError(ManualsError):
    """La subida no contiene exactamente una fuente de manual."""


class ManualTooLargeError(ManualsError):
    """El conjunto de ficheros del manual supera el límite permitido."""


class ManualNotFoundError(ManualsError):
    """El manual no existe, está borrado o no pertenece al usuario."""


class ManualContextNotFoundError(ManualsError):
    """No hay chunks autorizados para responder la pregunta."""


class ManualBusyError(ManualsError):
    """El manual está siendo procesado y no admite cambios concurrentes."""


class ManualNotEditableError(ManualsError):
    """El manual está compartido y su texto no puede editarse a mano."""


class GeneratedAnswerTooLongError(ManualsError):
    """El LLM generó una respuesta que no cabe en la tabla de mensajes."""
