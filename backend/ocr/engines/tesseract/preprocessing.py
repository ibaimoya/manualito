"""Preprocesado elegido por benchmark para Tesseract."""

from ocr.engines.preprocessing import ImageArray, gray_bgr, resize_bgr

TESSERACT_RESIZE_SCALE = 2.5


def preprocess_for_tesseract(image: ImageArray) -> ImageArray:
    """Aplica resize x2.5 y escala de grises manteniendo BGR."""
    return gray_bgr(resize_bgr(image, scale=TESSERACT_RESIZE_SCALE))
