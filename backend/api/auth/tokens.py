"""Tokens opacos y hashes asociados a sesiones."""

import hashlib
import hmac
import secrets

TOKEN_BYTES = 32


def generate_opaque_token() -> str:
    """Genera un token URL-safe con 256 bits de entropía."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def hash_token(token: str) -> str:
    """Calcula SHA-256 hex de un token opaco de alta entropía."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_matches(token: str, expected_hash: str) -> bool:
    """Compara token crudo contra hash esperado en tiempo constante."""
    return hmac.compare_digest(hash_token(token), expected_hash)

