from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class OcrPostprocessConfig:
    low_confidence_line: float
    short_text_max_alnum: int
    very_short_text_max_chars: int
    symbol_noise_ratio: float
    min_alnum_to_keep: int


def postprocess_ocr_lines(
    lines: list[dict[str, object]],
    *,
    config: OcrPostprocessConfig,
) -> list[dict[str, object]]:
    """Limpia ruido OCR de baja confianza sin alterar el contenido útil."""
    processed = []
    for line in lines:
        normalized = _normalize_ocr_line(line)
        if normalized is None or _is_probable_noise(normalized, config):
            continue
        processed.append(normalized)
    return processed


def _normalize_ocr_line(line: dict[str, object]) -> dict[str, object] | None:
    text = line.get("text")
    if not isinstance(text, str):
        return None

    normalized_text = _normalize_line_text(text)
    if not normalized_text:
        return None

    normalized = dict(line)
    normalized["text"] = normalized_text
    return normalized


def _normalize_line_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).replace("\u00ad", "")
    return re.sub(r"\s+", " ", normalized).strip()


def _is_probable_noise(line: dict[str, object], config: OcrPostprocessConfig) -> bool:
    text = line["text"]
    alnum_count = _alnum_count(text)
    if alnum_count < config.min_alnum_to_keep and not _is_useful_short_token(text):
        return True

    confidence = _numeric_confidence(line.get("confidence"))
    if confidence is None or confidence >= config.low_confidence_line:
        return False

    visible_length = _visible_length(text)
    if _is_useful_short_token(text):
        return False
    if alnum_count <= config.short_text_max_alnum:
        return True
    if visible_length <= config.very_short_text_max_chars:
        return True
    return _symbol_ratio(text) >= config.symbol_noise_ratio


def _numeric_confidence(value: object) -> float | None:
    return value if isinstance(value, int | float) and not isinstance(value, bool) else None


def _alnum_count(text: str) -> int:
    return sum(character.isalnum() for character in text)


def _visible_length(text: str) -> int:
    return sum(not character.isspace() for character in text)


def _symbol_ratio(text: str) -> float:
    visible = [character for character in text if not character.isspace()]
    if not visible:
        return 0.0
    symbols = sum(not character.isalnum() for character in visible)
    return symbols / len(visible)


# Reconoce números, rangos, romanos y siglas breves que no son ruido OCR.
_USEFUL_SHORT_TOKEN_PATTERNS = (
    re.compile(r"[+-]?\d+(?:[.,]\d+)?%?"),
    re.compile(r"\d+\s*[-\u2013]\s*\d+"),
    re.compile(r"[IVXLCDM]{1,6}"),
    re.compile(r"[A-ZÁÉÍÓÚÜÑ]{1,4}"),
)


def _is_useful_short_token(text: str) -> bool:
    token = text.strip().rstrip(".)")
    return any(pattern.fullmatch(token) for pattern in _USEFUL_SHORT_TOKEN_PATTERNS)
