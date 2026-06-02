"""Helpers criptográficos pequeños y reutilizables."""

import hashlib


def sha256_hex(value: bytes | str) -> str:
    """Devuelve SHA-256 en hexadecimal para datos de alta entropía o contenido."""
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(payload).hexdigest()
