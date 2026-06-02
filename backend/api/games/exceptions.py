"""Errores de dominio del catálogo de juegos."""


class GamesError(Exception):
    """Clase base para errores esperados de juegos."""


class BggUnavailableError(GamesError):
    """BoardGameGeek no está disponible o pide reintentar más tarde."""


class GameNotFoundError(GamesError):
    """El juego seleccionado no existe o no está activo."""
