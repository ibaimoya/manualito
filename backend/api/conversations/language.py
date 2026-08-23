"""Resolución de idioma para conversaciones."""

from collections.abc import Sequence

from api.conversations.dto import MessageSnapshot
from common.language import Language, detect_language


def resolve_conversation_language(
    *,
    current_message: str,
    history: Sequence[MessageSnapshot],
    accept_language: Language | None,
) -> Language:
    """Resuelve el idioma del turno con señales ordenadas por prioridad."""
    detected = detect_language(text=current_message)
    if detected is not None:
        return detected

    for message in reversed(history):
        if message.role != "user":
            continue
        detected = detect_language(text=message.content)
        if detected is not None:
            return detected

    if accept_language is not None:
        return accept_language
    return "es"
