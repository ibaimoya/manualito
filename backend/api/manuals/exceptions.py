"""Errores de dominio del flujo de manuales."""

from api.games.exceptions import GameNotFoundError

__all__ = [
    "GameNotFoundError",
    "ManualContextNotFoundError",
    "ManualNotFoundError",
    "ManualWithoutTextError",
    "ManualsError",
]


class ManualsError(Exception):
    """Clase base para errores esperados de manuales."""


class ManualWithoutTextError(ManualsError):
    """El OCR no produjo texto suficiente para generar chunks."""


class ManualNotFoundError(ManualsError):
    """El manual no existe, está borrado o no pertenece al usuario."""


class ManualContextNotFoundError(ManualsError):
    """No hay chunks autorizados para responder la pregunta."""
