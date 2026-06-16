"""Excepciones de dominio para conversaciones."""


class ConversationsError(Exception):
    """Clase base para errores esperados de conversaciones."""


class ConversationNotFoundError(ConversationsError):
    """La conversación no existe, está borrada o pertenece a otro usuario."""


class NoManualSourcesError(ConversationsError):
    """El juego se quedó sin manuales con los que fundamentar la respuesta."""
