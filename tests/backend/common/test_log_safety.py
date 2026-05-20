"""Tests de common.log_safety (prevención de log injection)."""
from common.log_safety import safe_for_log


def test_plain_text_unchanged():
    """Las cadenas sin caracteres de control no se modifican."""
    assert safe_for_log("manual.jpg") == "manual.jpg"


def test_unicode_accents_preserved():
    """Las letras acentuadas y caracteres unicode no se filtran."""
    assert safe_for_log("Reglas del Catán.pdf") == "Reglas del Catán.pdf"


def test_spaces_and_punctuation_preserved():
    """Espacios, guiones, puntos y guiones bajos quedan intactos."""
    assert safe_for_log("manual_2024-01-15.png") == "manual_2024-01-15.png"


def test_none_returns_default_fallback():
    """``None`` se sustituye por el fallback por defecto."""
    assert safe_for_log(None) == "<unknown>"


def test_empty_string_returns_default_fallback():
    """La cadena vacía también va al fallback."""
    assert safe_for_log("") == "<unknown>"


def test_custom_fallback_used_when_provided():
    """Se respeta el fallback personalizado si se pasa."""
    assert safe_for_log(None, fallback="<sin nombre>") == "<sin nombre>"


def test_custom_fallback_is_sanitized():
    """El fallback personalizado tampoco puede introducir saltos de log."""
    assert safe_for_log(None, fallback="<sin\r\nnombre>") == "<sin??nombre>"


def test_all_ascii_control_characters_replaced():
    """El rango de control ASCII se reemplaza por ``?``."""
    control_chars = "".join(chr(code) for code in range(0x20)) + "\x7f"
    assert safe_for_log(control_chars) == "?" * len(control_chars)


def test_carriage_return_replaced():
    """CR (``\\r``) se reemplaza por ``?``."""
    assert safe_for_log("manual\r.jpg") == "manual?.jpg"


def test_line_feed_replaced():
    """LF (``\\n``) se reemplaza por ``?``."""
    assert safe_for_log("manual\n.jpg") == "manual?.jpg"


def test_crlf_injection_attempt_neutralized():
    """Un intento de inyectar una línea entera de log queda anulado."""
    payload = "ok.jpg\r\n2025-01-01 [WARNING] FALSO"
    result = safe_for_log(payload)
    assert "\r" not in result
    assert "\n" not in result


def test_tab_replaced():
    """TAB (``\\t``) también se considera carácter de control."""
    assert safe_for_log("a\tb") == "a?b"


def test_null_byte_replaced():
    """El byte nulo (``\\x00``) se reemplaza."""
    assert safe_for_log("foo\x00bar") == "foo?bar"


def test_del_character_replaced():
    """El carácter DEL (``\\x7f``) también se reemplaza."""
    assert safe_for_log("foo\x7fbar") == "foo?bar"
