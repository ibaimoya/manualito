"""Validación y normalización de usernames."""

import unicodedata

from database.models.constants import USERNAME_KEY_MAX_LENGTH, USERNAME_MAX_LENGTH

USERNAME_ALLOWED_SYMBOLS = frozenset({"_", "-", "."})


class UsernameValidationError(ValueError):
    """El username no cumple las reglas públicas de registro."""


def normalize_username(username: str) -> str:
    """Devuelve el username normalizado que se guardará y mostrará."""
    normalized = _normalize_compatibility(username)

    if not normalized:
        raise UsernameValidationError("El nombre de usuario no puede estar vacío.")
    if normalized != normalized.strip():
        raise UsernameValidationError("El nombre de usuario no puede tener espacios alrededor.")
    if len(normalized) > USERNAME_MAX_LENGTH:
        raise UsernameValidationError("El nombre de usuario es demasiado largo.")
    if "@" in normalized:
        raise UsernameValidationError("El nombre de usuario no puede contener @.")
    if any(character.isspace() for character in normalized):
        raise UsernameValidationError("El nombre de usuario no puede contener espacios.")
    if invalid_character := _find_invalid_character(normalized):
        raise UsernameValidationError(
            f"El nombre de usuario contiene un carácter no permitido: {invalid_character!r}."
        )

    return normalized


def build_username_key(username: str) -> str:
    """Construye la clave estable para buscar y comparar usernames."""
    normalized = _normalize_compatibility(username.strip())

    if not normalized:
        raise UsernameValidationError("El nombre de usuario no puede estar vacío.")

    key = normalized.casefold()
    if len(key) > USERNAME_KEY_MAX_LENGTH:
        raise UsernameValidationError(
            "La clave normalizada del nombre de usuario es demasiado larga."
        )

    return key


def _normalize_compatibility(username: str) -> str:
    """Aplica la normalización Unicode elegida para usernames."""
    return unicodedata.normalize("NFKC", username)


def _find_invalid_character(username: str) -> str | None:
    """Devuelve el primer carácter fuera de las clases permitidas."""
    return next(
        (
            character
            for character in username
            if not _is_allowed_username_character(character)
        ),
        None,
    )


def _is_allowed_username_character(character: str) -> bool:
    """Permite letras Unicode, marcas, números y símbolos seguros."""
    category = unicodedata.category(character)
    return (
        category[0] in {"L", "M"}
        or category == "Nd"
        or character in USERNAME_ALLOWED_SYMBOLS
    )

