import pytest

from common.language import detect_language


@pytest.mark.parametrize(
    "text",
    [
        "á",
        "É",
        "í",
        "Ó",
        "ú",
        "Ñ",
        "¿",
        "¡",
        "co\u0301mo",
        "QUE",
        "como",
        "para",
        "cuantos",
        "cuantas",
        "donde",
        "puedo",
        "hola",
        "juego",
        "se",
    ],
)
def test_detect_language_recognizes_spanish_equivalence_classes(text):
    """Las señales españolas cubren grafías y palabras completas."""
    assert detect_language(text=text) == "es"


@pytest.mark.parametrize(
    "text",
    [
        "THE",
        "how",
        "what",
        "can",
        "is",
        "where",
        "should",
        "I",
        "hello",
        "game",
    ],
)
def test_detect_language_recognizes_english_equivalence_classes(text):
    """Las señales inglesas funcionan también en mensajes de una palabra."""
    assert detect_language(text=text) == "en"


@pytest.mark.parametrize(
    "text",
    [
        "",
        " ",
        "ok",
        "12345",
        "🎲🎯",
        "chess",
        "theater",
        "queue",
        "island",
        "telegram",
    ],
)
def test_detect_language_leaves_ambiguous_equivalence_classes_unresolved(text):
    """El contenido sin palabras señal queda sin resolver."""
    assert detect_language(text=text) is None


@pytest.mark.parametrize(
    "text",
    [
        "How can I ganar para desempatar",
        "What happens with la piñata",
        "THE rule que applies here",
        "How se juega",
        "Can los players trade",
    ],
)
def test_detect_language_gives_spanish_precedence_in_spanglish(text):
    """Una señal española prevalece aunque también aparezcan señales inglesas."""
    assert detect_language(text=text) == "es"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("the", "en"),
        ("the!", "en"),
        ("x the", "en"),
        ("the x", "en"),
        ("athe", None),
        ("thea", None),
        ("que", "es"),
        ("que?", "es"),
        ("x que", "es"),
        ("que x", "es"),
        ("aque", None),
        ("quex", None),
    ],
)
def test_detect_language_honors_word_boundaries(text, expected):
    """Las señales solo cuentan dentro de sus fronteras de palabra."""
    assert detect_language(text=text) == expected
