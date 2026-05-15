from unittest.mock import patch

import pytest
from engines.tesseract import TesseractOcrEngine
from engines.tesseract.engine import TESSERACT_TIMEOUT_SECONDS, Output


def _engine_without_init() -> TesseractOcrEngine:
    """Crea una instancia ligera para probar extract_text sin validar binarios."""
    engine = TesseractOcrEngine.__new__(TesseractOcrEngine)
    engine._lang = "spa"
    return engine


def _tesseract_data(
    *,
    text: list[str],
    conf: list[str],
    line_num: list[int],
) -> dict[str, list[int] | list[str]]:
    """Construye una salida minima compatible con pytesseract.image_to_data."""
    return {
        "text": text,
        "conf": conf,
        "page_num": [1] * len(text),
        "block_num": [1] * len(text),
        "par_num": [1] * len(text),
        "line_num": line_num,
    }


def test_tesseract_engine_name():
    """El engine expone un nombre estable para logs, metricas y tests."""
    assert TesseractOcrEngine.name == "tesseract"


def test_tesseract_initializes_wrapper():
    """Comprueba pronto que el binario y el idioma estan disponibles."""
    with patch(
        "engines.tesseract.engine.pytesseract.get_tesseract_version",
        return_value="5.3.0",
    ) as get_version, patch(
        "engines.tesseract.engine.pytesseract.get_languages",
        return_value=["eng", "spa"],
    ) as get_languages:
        engine = TesseractOcrEngine()

    assert engine._lang == "spa"
    get_version.assert_called_once_with()
    get_languages.assert_called_once_with(config="")


def test_tesseract_rejects_missing_language():
    """Falla al arrancar si falta el pack de idioma configurado."""
    with patch(
        "engines.tesseract.engine.pytesseract.get_tesseract_version",
        return_value="5.3.0",
    ), patch(
        "engines.tesseract.engine.pytesseract.get_languages",
        return_value=["eng"],
    ), pytest.raises(RuntimeError, match="pack de idioma 'spa'"):
        TesseractOcrEngine()


def test_tesseract_propagates_initialization_error():
    """Propaga los fallos de inicializacion de Tesseract."""
    with patch(
        "engines.tesseract.engine.pytesseract.get_tesseract_version",
        side_effect=RuntimeError("tesseract no disponible"),
    ), pytest.raises(RuntimeError, match="tesseract no disponible"):
        TesseractOcrEngine()


def test_tesseract_engine_extract_text_groups_words_by_line():
    """Agrupa palabras de Tesseract por linea y normaliza la confianza."""
    engine = _engine_without_init()
    tesseract_result = _tesseract_data(
        text=["Reglas", "del", "juego", "Turno", "final"],
        conf=["96.0", "94.0", "90.0", "80.0", "70.0"],
        line_num=[1, 1, 1, 2, 2],
    )

    with patch(
        "engines.tesseract.engine.pytesseract.image_to_data",
        return_value=tesseract_result,
    ) as image_to_data:
        result = engine.extract_text("fake/path.jpg")

    assert result == [
        {"text": "Reglas del juego", "confidence": 0.9333},
        {"text": "Turno final", "confidence": 0.75},
    ]
    image_to_data.assert_called_once_with(
        "fake/path.jpg",
        lang="spa",
        output_type=Output.DICT,
        timeout=TESSERACT_TIMEOUT_SECONDS,
    )


def test_tesseract_engine_filters_empty_and_invalid_entries():
    """Descarta textos vacios y confianzas no validas."""
    engine = _engine_without_init()
    tesseract_result = _tesseract_data(
        text=["", " Valido ", "Sin confianza", "No numerico", "Negativo"],
        conf=["-1", "90", "", "abc", "-1"],
        line_num=[1, 1, 1, 1, 1],
    )

    with patch(
        "engines.tesseract.engine.pytesseract.image_to_data",
        return_value=tesseract_result,
    ):
        result = engine.extract_text("fake/path.jpg")

    assert result == [{"text": "Valido", "confidence": 0.9}]


def test_tesseract_engine_propagates_exception():
    """Las excepciones del motor OCR se propagan sin capturar."""
    engine = _engine_without_init()

    with patch(
        "engines.tesseract.engine.pytesseract.image_to_data",
        side_effect=RuntimeError("fallo del modelo"),
    ), pytest.raises(RuntimeError, match="fallo del modelo"):
        engine.extract_text("fake/path.jpg")
