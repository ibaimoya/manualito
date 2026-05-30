"""Hashing y validación de passwords de usuario."""

from pwdlib import PasswordHash

from api import config

_PASSWORD_HASH = PasswordHash.recommended()
_DUMMY_PASSWORD_HASH = _PASSWORD_HASH.hash("dummy-password-for-timing-checks")


class PasswordValidationError(ValueError):
    """La contraseña no cumple la política de registro."""


def validate_password_policy(password: str) -> None:
    """Valida longitud sin imponer reglas de composición arbitrarias."""
    if len(password) < config.PASSWORD_MIN_LENGTH:
        raise PasswordValidationError("La password es demasiado corta.")
    if len(password) > config.PASSWORD_MAX_LENGTH:
        raise PasswordValidationError("La password es demasiado larga.")


def hash_password(password: str) -> str:
    """Genera un hash Argon2id para persistir la password."""
    return _PASSWORD_HASH.hash(password)


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Verifica una contraseña y devuelve hash actualizado si los parámetros cambian."""
    return _PASSWORD_HASH.verify_and_update(password, password_hash)


def verify_password_against_dummy(password: str) -> None:
    """Ejecuta Argon2 aunque no exista usuario para que el tiempo de respuesta
    no revele si la cuenta existe."""
    _PASSWORD_HASH.verify(password, _DUMMY_PASSWORD_HASH)

