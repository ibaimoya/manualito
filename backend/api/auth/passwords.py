"""Hashing y validación de passwords de usuario."""

import anyio
from pwdlib import PasswordHash

from api import config

_PASSWORD_HASH = PasswordHash.recommended()
_DUMMY_PASSWORD_HASH = _PASSWORD_HASH.hash("dummy-password-for-timing-checks")

# Argon2 consume CPU y memoria; este limitador evita saturar el worker con hashes simultáneos.
_PASSWORD_HASH_LIMITER = anyio.CapacityLimiter(config.PASSWORD_HASH_CONCURRENCY)


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


async def hash_password_async(password: str) -> str:
    """Genera un hash Argon2id fuera del event loop."""
    return await anyio.to_thread.run_sync(
        hash_password,
        password,
        limiter=_PASSWORD_HASH_LIMITER,
    )


def verify_password(password: str, password_hash: str) -> tuple[bool, str | None]:
    """Verifica una contraseña y devuelve hash actualizado si los parámetros cambian."""
    return _PASSWORD_HASH.verify_and_update(password, password_hash)


async def verify_password_async(
    password: str,
    password_hash: str,
) -> tuple[bool, str | None]:
    """Verifica una contraseña fuera del event loop."""
    return await anyio.to_thread.run_sync(
        verify_password,
        password,
        password_hash,
        limiter=_PASSWORD_HASH_LIMITER,
    )


def verify_password_against_dummy(password: str) -> None:
    """Ejecuta Argon2 aunque no exista usuario para que el tiempo de respuesta
    no revele si la cuenta existe."""
    _PASSWORD_HASH.verify(password, _DUMMY_PASSWORD_HASH)


async def verify_password_against_dummy_async(password: str) -> None:
    """Ejecuta el verify dummy fuera del event loop."""
    await anyio.to_thread.run_sync(
        verify_password_against_dummy,
        password,
        limiter=_PASSWORD_HASH_LIMITER,
    )
