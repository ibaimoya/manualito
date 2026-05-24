"""
Utilidades para prevenir log injection (regla python:S5145 de SonarCloud).

Los datos controlados por el usuario que se escriben en los logs pueden
contener caracteres de control (``\r``, ``\n``, etc.) que un atacante
usaria para forjar lineas falsas y manipular las trazas.
"""
import re

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_CONTROL_CHAR_REPLACEMENT = "?"


def safe_for_log(value: str | None, *, fallback: str = "<unknown>") -> str:
    """
    Reemplaza los caracteres de control de una cadena para usarla en logs.

    Sustituye por ``?`` cada caracter del rango ``0x00-0x1f`` y ``0x7f`` (incluye
    CR, LF, TAB y otros caracteres de control). Mantiene letras, digitos,
    acentos, espacios y signos de puntuacion normales.

    Args:
        value: Cadena potencialmente controlada por el usuario.
        fallback: Texto a devolver cuando ``value`` es ``None`` o vacio.

    Returns:
        Cadena saneada apta para interpolar en un mensaje de logging.
    """
    text = value or fallback
    return _CONTROL_CHARS_RE.sub(_CONTROL_CHAR_REPLACEMENT, text)
