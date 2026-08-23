"""Anotaciones de corrección con offsets de codepoints sobre el texto final."""

from __future__ import annotations

import difflib
import re

_TOKEN_PATTERN = re.compile(r"\S+")


def correction_annotations(*, base: str, corrected: str) -> tuple[dict[str, object], ...]:
    """Deriva las anotaciones de cambio comparando la base y el texto final por palabras."""
    base_words = base.split()
    matcher = difflib.SequenceMatcher(None, base_words, corrected.split())
    spans = [match.span() for match in _TOKEN_PATTERN.finditer(corrected)]
    annotations: list[dict[str, object]] = []
    for tag, base_start, base_end, start, end in matcher.get_opcodes():
        if tag == "equal":
            continue
        if start == end:
            anchor = spans[start][0] if start < len(spans) else len(corrected)
            first, last = anchor, anchor
        else:
            first, last = spans[start][0], spans[end - 1][1]
        annotations.append(
            {
                "start": first,
                "end": last,
                "original": " ".join(base_words[base_start:base_end]),
            }
        )
    return tuple(annotations)
