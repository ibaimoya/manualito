import os

import cv2
import numpy as np
import pytest

from ocr.engines.paddle.preprocessing import preprocess_for_paddle
from ocr.engines.preprocessing import (
    clahe_bgr,
    ensure_bgr,
    gray_bgr,
    load_bgr_image,
    preprocessed_image_path,
    resize_bgr,
)
from ocr.engines.tesseract.preprocessing import preprocess_for_tesseract


def test_tesseract_preprocessing_resizes_x25_and_keeps_bgr():
    """El preprocesado elegido para Tesseract aplica resize x2.5 y gris en BGR."""
    image = _sample_image(width=8, height=4)

    processed = preprocess_for_tesseract(image)

    assert processed.shape == (10, 20, 3)
    assert _channels_are_equal(processed)


def test_paddle_preprocessing_applies_clahe_without_resizing():
    """El preprocesado elegido para Paddle conserva tamaño y devuelve BGR."""
    image = _sample_image(width=17, height=11)

    processed = preprocess_for_paddle(image)

    assert processed.shape == image.shape
    assert processed.dtype == np.uint8


def test_common_helpers_keep_bgr_contract():
    """Las transformaciones compartidas devuelven siempre 3 canales BGR."""
    gray = np.arange(12, dtype=np.uint8).reshape(3, 4)
    bgr = ensure_bgr(gray)

    assert bgr.shape == (3, 4, 3)
    assert resize_bgr(bgr, scale=2).shape == (6, 8, 3)
    assert gray_bgr(bgr).shape == (3, 4, 3)
    assert clahe_bgr(bgr, clip_limit=1.0, tile_size=2).shape == (3, 4, 3)


def test_load_bgr_image_fails_clearly_for_invalid_path():
    """Una ruta inválida falla antes de llamar al motor OCR."""
    with pytest.raises(ValueError, match="No se pudo leer la imagen"):
        load_bgr_image("ruta/inexistente.jpg")


def test_preprocessed_image_path_cleans_temp_file_on_success(tmp_path):
    """El temporal de preprocesado se elimina tras una ejecución correcta."""
    source_path = tmp_path / "source.jpg"
    _write_image(source_path, _sample_image(width=5, height=3))

    with preprocessed_image_path(str(source_path), preprocess_for_tesseract) as processed_path:
        assert processed_path != str(source_path)
        assert os.path.exists(processed_path)
        assert load_bgr_image(processed_path).shape == (8, 12, 3)

    assert not os.path.exists(processed_path)


def test_preprocessed_image_path_cleans_temp_file_on_error(tmp_path):
    """El temporal de preprocesado se elimina aunque falle el motor OCR."""
    source_path = tmp_path / "source.jpg"
    _write_image(source_path, _sample_image(width=5, height=3))
    processed_path = ""

    with (
        pytest.raises(RuntimeError, match="fallo OCR"),
        preprocessed_image_path(str(source_path), preprocess_for_paddle) as path,
    ):
        processed_path = path
        assert os.path.exists(processed_path)
        raise RuntimeError("fallo OCR")

    assert processed_path
    assert not os.path.exists(processed_path)


def _sample_image(*, width: int, height: int) -> np.ndarray:
    rows = np.linspace(0, 255, height, dtype=np.uint8)[:, None]
    cols = np.linspace(0, 255, width, dtype=np.uint8)[None, :]
    channel = ((rows.astype(np.uint16) + cols.astype(np.uint16)) // 2).astype(np.uint8)
    return np.dstack((channel, np.flipud(channel), np.fliplr(channel)))


def _write_image(path, image: np.ndarray) -> None:
    assert cv2.imwrite(str(path), image)


def _channels_are_equal(image: np.ndarray) -> bool:
    return bool(
        np.array_equal(image[:, :, 0], image[:, :, 1])
        and np.array_equal(image[:, :, 1], image[:, :, 2])
    )
