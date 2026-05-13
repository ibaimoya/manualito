from unittest.mock import Mock, patch

import extractor
import pytest
from engines.paddle.cpu import PaddleCpuOcrEngine


def _paddle_cpu_engine_with_result(predict_result):
    engine = PaddleCpuOcrEngine.__new__(PaddleCpuOcrEngine)
    engine._ocr = Mock()
    engine._ocr.predict.return_value = predict_result
    return engine


# ---------------------------------------------------------------------------
# Particion de Equivalencia (EP) - resultados del modelo
#   Clase 1: Una linea detectada con confianza alta.
#   Clase 2: Multiples lineas en un unico bloque de resultado.
#   Clase 3: Multiples bloques (e.g., varias regiones de la imagen).
#   Clase 4: Sin lineas detectadas - lista vacia, se emite WARNING en log.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("predict_result,expected", [
    (
        [{"rec_texts": ["Instrucciones"], "rec_scores": [0.9876]}],
        [{"text": "Instrucciones", "confidence": 0.9876}],
    ),
    (
        [{"rec_texts": ["Turno 1", "Turno 2", "Turno 3"],
          "rec_scores": [0.99, 0.85, 0.72]}],
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
def test_paddle_cpu_engine_extract_text_results(predict_result, expected):
    """Transforma el output del OCR Paddle CPU en lista normalizada."""
    engine = _paddle_cpu_engine_with_result(predict_result)
    result = engine.extract_text("fake/path.jpg")
    assert result == expected


# ---------------------------------------------------------------------------
# Analisis de Valores Limite (BVA) - redondeo de confianza a 4 decimales
#   0.123456789 -> 0.1235  (redondea al alza en el quinto decimal).
#   0.99999     -> 1.0     (limite superior de confianza).
#   0.0         -> 0.0     (limite inferior de confianza).
#   0.00004     -> 0.0     (justo por debajo de 0.0001).
#   0.00005     -> 0.0001  (justo en el punto de redondeo hacia 0.0001).
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("raw_score,expected_confidence", [
    (0.123456789, 0.1235),
    (0.99999,     1.0),
    (0.0,         0.0),
    (0.00004,     0.0),
    (0.00005,     0.0001),
], ids=[
    "redondeo_normal", "limite_superior", "limite_inferior",
    "debajo_0001", "en_0001",
])
def test_paddle_cpu_engine_confidence_rounding(raw_score, expected_confidence):
    """El score se redondea a exactamente 4 decimales."""
    predict_result = [{"rec_texts": ["texto"], "rec_scores": [raw_score]}]
    engine = _paddle_cpu_engine_with_result(predict_result)
    result = engine.extract_text("fake/path.jpg")
    assert result[0]["confidence"] == expected_confidence


# ---------------------------------------------------------------------------
# Particion de Equivalencia (EP) - propagacion de errores del modelo
#   Clase 5: predict lanza una excepcion -> se propaga sin capturar.
# ---------------------------------------------------------------------------
def test_paddle_cpu_engine_propagates_exception():
    """Las excepciones del motor OCR se propagan sin capturar."""
    engine = PaddleCpuOcrEngine.__new__(PaddleCpuOcrEngine)
    engine._ocr = Mock()
    engine._ocr.predict.side_effect = RuntimeError("fallo del modelo")

    with pytest.raises(RuntimeError, match="fallo del modelo"):
        engine.extract_text("fake/path.jpg")


def test_paddle_cpu_engine_name():
    """El engine expone un nombre estable para logs, metricas y tests."""
    assert PaddleCpuOcrEngine.name == "paddle_cpu"


def test_paddle_cpu_initializes_paddleocr_with_cpu():
    """Inicializa PaddleOCR apuntando explicitamente al dispositivo CPU."""
    with patch("engines.paddle.cpu.engine.PaddleOCR") as paddleocr:
        PaddleCpuOcrEngine()

    paddleocr.assert_called_once_with(
        use_textline_orientation=True,
        lang="es",
        enable_mkldnn=False,
        device="cpu",
    )


def test_paddle_cpu_propagates_initialization_error():
    """Propaga los fallos de inicializacion de PaddleOCR."""
    with patch(
        "engines.paddle.cpu.engine.PaddleOCR",
        side_effect=RuntimeError("fallo init"),
    ), pytest.raises(RuntimeError, match="fallo init"):
        PaddleCpuOcrEngine()


def test_extract_text_delegates_to_configured_engine(monkeypatch):
    """La fachada extract_text delega en el engine configurado."""
    expected = [{"text": "Reglas", "confidence": 0.9}]
    fake_engine = Mock()
    fake_engine.extract_text.return_value = expected
    create_ocr_engine = Mock(return_value=fake_engine)
    extractor.get_ocr_engine.cache_clear()
    monkeypatch.setattr(extractor, "create_ocr_engine", create_ocr_engine)

    result = extractor.extract_text("fake/path.jpg")

    assert result == expected
    fake_engine.extract_text.assert_called_once_with("fake/path.jpg")
    create_ocr_engine.assert_called_once_with()
    extractor.get_ocr_engine.cache_clear()


def test_get_ocr_engine_uses_factory_once(monkeypatch):
    """El engine se crea bajo demanda y se reutiliza."""
    fake_engine = Mock()
    create_ocr_engine = Mock(return_value=fake_engine)
    extractor.get_ocr_engine.cache_clear()
    monkeypatch.setattr(extractor, "create_ocr_engine", create_ocr_engine)

    assert extractor.get_ocr_engine() is fake_engine
    assert extractor.get_ocr_engine() is fake_engine
    create_ocr_engine.assert_called_once_with()
    extractor.get_ocr_engine.cache_clear()
