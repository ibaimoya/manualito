from unittest.mock import patch

import pytest

from ocr.extractor import extract_text


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — resultados del modelo
#   Clase 1: Una línea detectada con confianza alta.
#   Clase 2: Múltiples líneas en un único bloque de resultado.
#   Clase 3: Múltiples bloques (e.g., varias regiones de la imagen).
#   Clase 4: Sin líneas detectadas — lista vacía, se emite WARNING en log.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("predict_result,expected", [
    (
        [{"rec_texts": ["Instrucciones"], "rec_scores": [0.9876]}],
        [{"text": "Instrucciones", "confidence": 0.9876}],
    ),
    (
        [{"rec_texts": ["Turno 1", "Turno 2", "Turno 3"], "rec_scores": [0.99, 0.85, 0.72]}],
        [
            {"text": "Turno 1", "confidence": 0.99},
            {"text": "Turno 2", "confidence": 0.85},
            {"text": "Turno 3", "confidence": 0.72},
        ],
    ),
    (
        [
            {"rec_texts": ["Bloque A"], "rec_scores": [0.91]},
            {"rec_texts": ["Bloque B"], "rec_scores": [0.88]},
        ],
        [
            {"text": "Bloque A", "confidence": 0.91},
            {"text": "Bloque B", "confidence": 0.88},
        ],
    ),
    (
        [{"rec_texts": [], "rec_scores": []}],
        [],
    ),
], ids=["una_linea", "multiples_lineas", "multiples_bloques", "sin_texto"])
def test_extract_text_results(predict_result, expected):
    """La función transforma correctamente el output de PaddleOCR en la lista normalizada de líneas."""
    with patch("ocr.extractor._ocr") as mock_ocr:
        mock_ocr.predict.return_value = predict_result
        result = extract_text("fake/path.jpg")
    assert result == expected


# ---------------------------------------------------------------------------
# Análisis de Valores Límite (BVA) — redondeo de confianza a 4 decimales
#   0.123456789 → 0.1235  (redondea al alza en el quinto decimal).
#   0.99999     → 1.0     (límite superior de confianza).
#   0.0         → 0.0     (límite inferior de confianza).
#   0.00004     → 0.0     (justo por debajo de 0.0001 — redondea a 0.0).
#   0.00005     → 0.0001  (justo en el punto de redondeo hacia 0.0001).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("raw_score,expected_confidence", [
    (0.123456789, 0.1235),
    (0.99999,     1.0),
    (0.0,         0.0),
    (0.00004,     0.0),
    (0.00005,     0.0001),
], ids=["redondeo_normal", "limite_superior", "limite_inferior", "debajo_0001", "en_0001"])
def test_confidence_rounding(raw_score, expected_confidence):
    """El score del modelo se convierte a float y se redondea a exactamente 4 decimales."""
    predict_result = [{"rec_texts": ["texto"], "rec_scores": [raw_score]}]
    with patch("ocr.extractor._ocr") as mock_ocr:
        mock_ocr.predict.return_value = predict_result
        result = extract_text("fake/path.jpg")
    assert result[0]["confidence"] == expected_confidence


# ---------------------------------------------------------------------------
# Partición de Equivalencia (EP) — propagación de errores del modelo
#   Clase 5: predict lanza una excepción → se propaga sin capturar.
#            El caller (main.py) es responsable de manejarla.
# ---------------------------------------------------------------------------
def test_extract_text_propagates_exception():
    """Las excepciones de PaddleOCR se propagan sin capturar para que main.py las gestione."""
    with patch("ocr.extractor._ocr") as mock_ocr:
        mock_ocr.predict.side_effect = RuntimeError("fallo del modelo")
        with pytest.raises(RuntimeError, match="fallo del modelo"):
            extract_text("fake/path.jpg")
