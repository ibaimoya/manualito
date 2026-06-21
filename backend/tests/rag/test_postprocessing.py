from dataclasses import replace

import pytest

from common.ocr.postprocessing import OcrPostprocessConfig, postprocess_ocr_lines


@pytest.fixture
def postprocess_config() -> OcrPostprocessConfig:
    return OcrPostprocessConfig(
        low_confidence_line=0.35,
        short_text_max_alnum=3,
        very_short_text_max_chars=4,
        symbol_noise_ratio=0.60,
        min_alnum_to_keep=1,
    )


def test_postprocess_discards_short_low_confidence_noise(postprocess_config):
    """Las marcas sueltas de baja confianza no contaminan el texto guardado."""
    lines = [
        {"text": None, "confidence": 0.99},
        {"confidence": 0.99},
        {"text": "x", "confidence": 0.12},
        {"text": " :: ", "confidence": 0.80},
        {"text": "Preparación inicial", "confidence": 0.92},
    ]

    assert postprocess_ocr_lines(lines, config=postprocess_config) == [
        {"text": "Preparación inicial", "confidence": 0.92},
    ]


@pytest.mark.parametrize("text", ["7", "+2", "10%", "2-4", "2\u20134", "II", "A", "FAQ"])
def test_postprocess_keeps_useful_short_tokens(text, postprocess_config):
    """Los tokens breves de reglas se conservan aunque vengan con poca confianza."""
    lines = [{"text": text, "confidence": 0.10}]

    assert postprocess_ocr_lines(lines, config=postprocess_config) == [
        {"text": text, "confidence": 0.10},
    ]


def test_postprocess_normalizes_text_without_merging_hyphenated_lines(postprocess_config):
    """Normaliza espacios y caracteres, pero no une cortes por guion."""
    lines = [
        {"text": "  Preparación\tinicial  ", "confidence": 0.90},
        {"text": "propie-", "confidence": 0.90},
        {"text": "dades", "confidence": 0.90},
    ]

    assert postprocess_ocr_lines(lines, config=postprocess_config) == [
        {"text": "Preparación inicial", "confidence": 0.90},
        {"text": "propie-", "confidence": 0.90},
        {"text": "dades", "confidence": 0.90},
    ]


def test_postprocess_respects_configured_confidence_threshold(postprocess_config):
    """Bajar el umbral permite conservar una línea corta de confianza media."""
    relaxed_config = replace(postprocess_config, low_confidence_line=0.10)
    lines = [{"text": "de", "confidence": 0.20}]

    assert postprocess_ocr_lines(lines, config=relaxed_config) == [
        {"text": "de", "confidence": 0.20},
    ]


def test_postprocess_keeps_lines_without_numeric_confidence(postprocess_config):
    """Si falta confianza numérica no se aplica el filtro de baja confianza."""
    lines = [{"text": " de ", "confidence": None}]

    assert postprocess_ocr_lines(lines, config=postprocess_config) == [
        {"text": "de", "confidence": None},
    ]
