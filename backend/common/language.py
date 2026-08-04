"""Detección determinista de español e inglés."""

import re
import unicodedata
from typing import Literal

Language = Literal["es", "en"]

_SPANISH_MARKS = frozenset("áéíóúñ¿¡")
_SPANISH_STOPWORDS = frozenset(
    {
        "al",
        "antes",
        "cada",
        "como",
        "con",
        "cual",
        "cuando",
        "cuanta",
        "cuantas",
        "cuanto",
        "cuantos",
        "debe",
        "deben",
        "debo",
        "del",
        "desde",
        "despues",
        "donde",
        "el",
        "ella",
        "ellos",
        "empate",
        "en",
        "entre",
        "esta",
        "este",
        "explica",
        "ganar",
        "gana",
        "hay",
        "hola",
        "juega",
        "juego",
        "jugar",
        "jugador",
        "jugadores",
        "la",
        "las",
        "lo",
        "los",
        "mientras",
        "para",
        "pero",
        "podemos",
        "por",
        "porque",
        "puede",
        "pueden",
        "puedes",
        "puedo",
        "que",
        "quien",
        "quiero",
        "regla",
        "reglas",
        "se",
        "sin",
        "sobre",
        "tiene",
        "turno",
        "una",
        "uno",
        "yo",
    }
)
_ENGLISH_STOPWORDS = frozenset(
    {
        "after",
        "and",
        "are",
        "before",
        "can",
        "could",
        "did",
        "do",
        "does",
        "explain",
        "for",
        "from",
        "game",
        "has",
        "have",
        "hello",
        "how",
        "i",
        "into",
        "is",
        "may",
        "must",
        "my",
        "or",
        "player",
        "players",
        "rule",
        "rules",
        "score",
        "scoring",
        "should",
        "setup",
        "start",
        "the",
        "this",
        "those",
        "turn",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "would",
        "win",
        "winning",
        "with",
        "without",
        "you",
    }
)
_WORD_PATTERN = re.compile(r"[^\W\d_]+", re.UNICODE)


def detect_language(*, text: str) -> Language | None:
    """Detecta español o inglés solo cuando existe una señal clara."""
    normalized = unicodedata.normalize("NFC", text).casefold()
    if not _SPANISH_MARKS.isdisjoint(normalized):
        return "es"

    words = frozenset(_WORD_PATTERN.findall(normalized))
    if words & _SPANISH_STOPWORDS:
        return "es"
    if words & _ENGLISH_STOPWORDS:
        return "en"
    return None
