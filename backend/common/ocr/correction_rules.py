"""Filtro de confianza y reglas deterministas de corrección de líneas OCR."""

from __future__ import annotations

import re
from dataclasses import dataclass

_BULLET_ARTIFACT_PATTERN = re.compile(r"^[e*+•·«]\s+(?=[A-ZÁÉÍÓÚÜÑ])")
_GUIDE_DOTS_PATTERN = re.compile(r"\.{4,}")
_TRAILING_HYPHEN_PATTERN = re.compile(r"([a-záéíóúüñ]+)-$", re.IGNORECASE)
_WORD_PATTERN = re.compile(r"[a-záéíóúüñ]+", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class OcrCorrectionConfig:
    discard_below: float
    llm_below: float


def apply_confidence_gate(
    lines: list[dict[str, object]],
    *,
    config: OcrCorrectionConfig,
) -> list[dict[str, object]]:
    """Descarta líneas con confianza inferior al umbral de ruido."""
    survivors = []
    for line in lines:
        confidence = _numeric_confidence(line.get("confidence"))
        if confidence is not None and confidence < config.discard_below:
            continue
        survivors.append(line)
    return survivors


def needs_llm_correction(line: dict[str, object], *, config: OcrCorrectionConfig) -> bool:
    """Indica si la línea cae en la franja media de corrección del LLM."""
    confidence = _numeric_confidence(line.get("confidence"))
    if confidence is None:
        return False
    return config.discard_below <= confidence < config.llm_below


def strip_bullet_artifact(text: str) -> str:
    """Quita el marcador de viñeta leído por el OCR como una letra suelta."""
    return _BULLET_ARTIFACT_PATTERN.sub("", text)


def collapse_guide_dots(text: str) -> str:
    """Colapsa las secuencias de puntos guía de los índices."""
    return _GUIDE_DOTS_PATTERN.sub(".", text)


def page_vocabulary(lines: list[dict[str, object]]) -> frozenset[str]:
    """Reúne las palabras alfabéticas de la propia página en minúsculas."""
    words: set[str] = set()
    for line in lines:
        text = line.get("text")
        if isinstance(text, str):
            words.update(match.group(0).lower() for match in _WORD_PATTERN.finditer(text))
    return frozenset(words)


def merge_hyphenated_lines(
    lines: list[dict[str, object]],
    *,
    vocabulary: frozenset[str],
) -> list[dict[str, object]]:
    """Une palabras partidas por un guion al final de línea si la unión está en el vocabulario."""
    merged = [dict(line) for line in lines]
    index = 0
    while index < len(merged) - 1:
        current_text = merged[index].get("text")
        next_text = merged[index + 1].get("text")
        joined = _join_hyphenated(current_text, next_text, vocabulary=vocabulary)
        if joined is None:
            index += 1
            continue
        merged[index]["text"], remainder = joined
        if remainder:
            merged[index + 1]["text"] = remainder
            index += 1
        else:
            del merged[index + 1]
    return merged


def _join_hyphenated(
    current_text: object,
    next_text: object,
    *,
    vocabulary: frozenset[str],
) -> tuple[str, str] | None:
    if not isinstance(current_text, str) or not isinstance(next_text, str):
        return None
    fragment = _TRAILING_HYPHEN_PATTERN.search(current_text)
    if fragment is None:
        return None
    first_token, _, remainder = next_text.strip().partition(" ")
    candidate = (fragment.group(1) + first_token).lower()
    if not _WORD_PATTERN.fullmatch(candidate) or candidate not in vocabulary:
        return None
    return current_text[:-1] + first_token, remainder.strip()


def apply_correction_rules(
    lines: list[dict[str, object]],
    *,
    config: OcrCorrectionConfig,
    vocabulary: frozenset[str],
) -> list[dict[str, object]]:
    """Aplica el filtro de confianza, la limpieza por línea y el desguionado sobre copias."""
    cleaned = []
    for line in apply_confidence_gate(lines, config=config):
        text = line.get("text")
        if not isinstance(text, str):
            continue
        clean_line = dict(line)
        clean_line["text"] = collapse_guide_dots(strip_bullet_artifact(text)).strip()
        if clean_line["text"]:
            cleaned.append(clean_line)
    return merge_hyphenated_lines(cleaned, vocabulary=vocabulary)


def _numeric_confidence(value: object) -> float | None:
    return value if isinstance(value, int | float) and not isinstance(value, bool) else None
