"""Excepciones de dominio de valoraciones."""


class RatingsError(Exception):
    """Clase base para errores esperados de valoraciones."""


class RatingNotFoundError(RatingsError):
    """El usuario no tiene valoración guardada para ese juego."""
