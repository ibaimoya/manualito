"""Carga diferida del léxico español incluido en el proyecto."""

from __future__ import annotations

import functools
from pathlib import Path

_LEXICON_PATH = Path(__file__).parent / "data" / "lexico_es.txt"


@functools.cache
def spanish_lexicon() -> frozenset[str]:
    """Devuelve el vocabulario español en minúsculas como un frozenset en caché."""
    words = (line.strip() for line in _LEXICON_PATH.read_text(encoding="utf-8").splitlines())
    return frozenset(word for word in words if word and not word.startswith("#"))
