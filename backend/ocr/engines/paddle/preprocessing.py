"""Preprocesado elegido por benchmark para PaddleOCR."""

from ocr.engines.preprocessing import ImageArray, clahe_bgr

PADDLE_CLAHE_CLIP_LIMIT = 1.0
PADDLE_CLAHE_TILE_SIZE = 16


def preprocess_for_paddle(image: ImageArray) -> ImageArray:
    """Aplica CLAHE c=1 t=16 manteniendo BGR."""
    return clahe_bgr(
        image,
        clip_limit=PADDLE_CLAHE_CLIP_LIMIT,
        tile_size=PADDLE_CLAHE_TILE_SIZE,
    )
