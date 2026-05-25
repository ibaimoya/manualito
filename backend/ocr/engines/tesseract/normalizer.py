from typing import Any

from ocr.engines.common import OcrLine


def normalize_tesseract_result(result: dict[str, list[Any]]) -> list[OcrLine]:
    """
    Transforma la salida TSV de Tesseract en líneas OCR normalizadas.

    Tesseract devuelve una entrada por palabra; el contrato del servicio OCR
    trabaja por líneas, así que se agrupan las palabras por coordenadas lógicas
    de página/bloque/párrafo/línea y se promedia su confianza.
    """
    line_words: dict[tuple[Any, Any, Any, Any], list[str]] = {}
    line_confidences: dict[tuple[Any, Any, Any, Any], list[float]] = {}

    for index, raw_text in enumerate(result.get("text", [])):
        text = str(raw_text).strip()
        if not text:
            continue

        confidence = _parse_confidence(_value_at(result, "conf", index))
        if confidence is None:
            continue

        line_key = (
            _value_at(result, "page_num", index),
            _value_at(result, "block_num", index),
            _value_at(result, "par_num", index),
            _value_at(result, "line_num", index),
        )
        line_words.setdefault(line_key, []).append(text)
        line_confidences.setdefault(line_key, []).append(confidence)

    return [
        {
            "text": " ".join(words),
            "confidence": round(sum(line_confidences[key]) / len(line_confidences[key]), 4),
        }
        for key, words in line_words.items()
    ]


def _value_at(result: dict[str, list[Any]], key: str, index: int) -> Any:
    """Devuelve un valor TSV por índice o 0 si Tesseract omitió esa columna."""
    values = result.get(key, [])
    if index >= len(values):
        return 0
    return values[index]


def _parse_confidence(raw_confidence: Any) -> float | None:
    """
    Convierte la confianza porcentual de Tesseract a escala 0..1.

    Tesseract usa -1 para elementos estructurales sin texto reconocido; esos
    valores, junto con entradas vacías o no numéricas, se descartan.
    """
    try:
        confidence = float(raw_confidence)
    except (TypeError, ValueError):
        return None

    if confidence < 0:
        return None

    return confidence / 100
