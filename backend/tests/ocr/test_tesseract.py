from contextlib import contextmanager
from unittest.mock import patch

import pytest

from ocr.engines.tesseract import TesseractOcrEngine
from ocr.engines.tesseract.engine import TESSERACT_TIMEOUT_SECONDS, Output


def _engine_without_init() -> TesseractOcrEngine:
    """Crea una instancia ligera para probar extract_text sin validar binarios."""
    engine = object.__new__(TesseractOcrEngine)
    engine._lang = "spa"
    return engine


def _tesseract_data(
    *,
    text: list[str],
    conf: list[str],
    line_num: list[int],
) -> dict[str, list[int] | list[str]]:
    """Construye una salida mínima compatible con pytesseract.image_to_data."""
    return {
        "text": text,
        "conf": conf,
        "page_num": [1] * len(text),
        "block_num": [1] * len(text),
        "par_num": [1] * len(text),
        "line_num": line_num,
    }


@contextmanager
def _preprocessed_path(_image_path, _preprocessor):
    yield "preprocessed/path.jpg"


def test_tesseract_engine_name():
    """El engine expone un nombre estable para logs, métricas y tests."""
    assert TesseractOcrEngine.name == "tesseract"


def test_tesseract_initializes_wrapper():
    """Comprueba pronto que el binario y el idioma están disponibles."""
    with patch(
        "ocr.engines.tesseract.engine.pytesseract.get_tesseract_version",
        return_value="5.3.0",
    ) as get_version, patch(
        "ocr.engines.tesseract.engine.pytesseract.get_languages",
        return_value=["eng", "spa"],
    ) as get_languages:
        engine = TesseractOcrEngine()

    assert engine._lang == "spa"
    get_version.assert_called_once_with()
    get_languages.assert_called_once_with(config="")


def test_tesseract_rejects_missing_language():
    """Falla al arrancar si falta el pack de idioma configurado."""
    with patch(
        "ocr.engines.tesseract.engine.pytesseract.get_tesseract_version",
        return_value="5.3.0",
    ), patch(
        "ocr.engines.tesseract.engine.pytesseract.get_languages",
        return_value=["eng"],
    ), pytest.raises(RuntimeError, match="pack de idioma 'spa'"):
        TesseractOcrEngine()


def test_tesseract_propagates_initialization_error():
    """Propaga los fallos de inicialización de Tesseract."""
    with patch(
        "ocr.engines.tesseract.engine.pytesseract.get_tesseract_version",
        side_effect=RuntimeError("tesseract no disponible"),
    ), pytest.raises(RuntimeError, match="tesseract no disponible"):
        TesseractOcrEngine()


def test_tesseract_engine_extract_text_groups_words_by_line():
    """Agrupa palabras de Tesseract por línea y normaliza la confianza."""
    engine = _engine_without_init()
    tesseract_result = _tesseract_data(
        text=["Reglas", "del", "juego", "Turno", "final"],
        conf=["96.0", "94.0", "90.0", "80.0", "70.0"],
        line_num=[1, 1, 1, 2, 2],
    )

    with patch(
        "ocr.engines.tesseract.engine.preprocessed_image_path",
        _preprocessed_path,
    ), patch(
        "ocr.engines.tesseract.engine.pytesseract.image_to_data",
        return_value=tesseract_result,
    ) as image_to_data:
        result = engine.extract_text("fake/path.jpg")

    assert result == [
        {"text": "Reglas del juego", "confidence": 0.9333},
        {"text": "Turno final", "confidence": 0.75},
    ]
    image_to_data.assert_called_once_with(
        "preprocessed/path.jpg",
        lang="spa",
        output_type=Output.DICT,
        timeout=TESSERACT_TIMEOUT_SECONDS,
    )


def test_tesseract_engine_filters_empty_and_invalid_entries():
    """Descarta textos vacíos y confianzas no válidas."""
    engine = _engine_without_init()
    tesseract_result = _tesseract_data(
        text=["", " Valido ", "Sin confianza", "No numerico", "Negativo"],
        conf=["-1", "90", "", "abc", "-1"],
        line_num=[1, 1, 1, 1, 1],
    )

    with patch(
        "ocr.engines.tesseract.engine.preprocessed_image_path",
        _preprocessed_path,
    ), patch(
        "ocr.engines.tesseract.engine.pytesseract.image_to_data",
        return_value=tesseract_result,
    ):
        result = engine.extract_text("fake/path.jpg")

    assert result == [{"text": "Valido", "confidence": 0.9}]


def test_tesseract_engine_propagates_exception():
    """Las excepciones del motor OCR se propagan sin capturar."""
    engine = _engine_without_init()

    with patch(
        "ocr.engines.tesseract.engine.preprocessed_image_path",
        _preprocessed_path,
    ), patch(
        "ocr.engines.tesseract.engine.pytesseract.image_to_data",
        side_effect=RuntimeError("fallo del modelo"),
    ), pytest.raises(RuntimeError, match="fallo del modelo"):
        engine.extract_text("fake/path.jpg")


def test_normalize_handles_missing_tsv_columns():
    """Cuando Tesseract omite columnas, los índices fuera de rango devuelven 0.

    Caso real: en imágenes muy degradadas Tesseract puede devolver listas de
    distinto largo entre columnas. El normalizer no debe crashear; agrupa con
    valor 0 las entradas sin coordenada lógica disponible (mismo line_num).
    """
    from ocr.engines.tesseract.normalizer import normalize_tesseract_result

    result = normalize_tesseract_result(
        {
            "text": ["uno", "dos", "tres", "cuatro"],
            "conf": ["90", "80", "70", "60"],
            "page_num": [1, 1, 1, 1],
            "block_num": [1, 1, 1, 1],
            "par_num": [1, 1, 1, 1],
            "line_num": [1, 1],  # columna corta: "tres" y "cuatro" caen en line_num=0.
        }
    )

    assert result == [
        {"text": "uno dos", "confidence": 0.85},
        {"text": "tres cuatro", "confidence": 0.65},
    ]
