"""Preprocesado temporal de imágenes antes de ejecutar OCR."""

import os
import tempfile
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager, suppress
from typing import Any, cast

import cv2
import numpy as np
from numpy.typing import NDArray

type ImageArray = NDArray[np.uint8]
type RawImageArray = NDArray[np.integer[Any] | np.floating[Any]]
type ImagePreprocessor = Callable[[ImageArray], ImageArray]

TEMP_IMAGE_EXTENSION = ".jpg"
JPEG_QUALITY = 95


@contextmanager
def preprocessed_image_path(
    image_path: str,
    preprocessor: ImagePreprocessor,
) -> Iterator[str]:
    """Guarda una versión preprocesada temporal y la elimina al terminar."""
    processed = ensure_bgr(preprocessor(load_bgr_image(image_path)))
    tmp_path = _new_temp_path()
    try:
        save_bgr_image(tmp_path, processed)
        yield tmp_path
    finally:
        with suppress(OSError):
            os.remove(tmp_path)


def load_bgr_image(image_path: str) -> ImageArray:
    """Carga una imagen como BGR de 3 canales o falla con un error claro."""
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"No se pudo leer la imagen para preprocesado OCR: {image_path!r}.")
    return ensure_bgr(image)


def save_bgr_image(image_path: str, image: ImageArray) -> None:
    """Guarda una imagen BGR en disco validando que OpenCV confirme la escritura."""
    success = cv2.imwrite(
        image_path,
        ensure_bgr(image),
        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY],
    )
    if not success:
        raise OSError(f"No se pudo guardar la imagen preprocesada: {image_path!r}.")


def ensure_bgr(image: RawImageArray) -> ImageArray:
    """Normaliza cualquier salida válida a BGR de 3 canales."""

    # Exige imagen uint8.
    if image.dtype != np.uint8:
        raise ValueError("La imagen preprocesada debe ser uint8.")
    if image.ndim == 2:
        # Normaliza gris 2D.
        return ensure_bgr(cv2.cvtColor(image, cv2.COLOR_GRAY2BGR))
    if image.ndim == 3 and image.shape[2] == 1:
        # Normaliza un canal.
        return ensure_bgr(cv2.cvtColor(image[:, :, 0], cv2.COLOR_GRAY2BGR))
    if image.ndim == 3 and image.shape[2] == 3:
        # Acepta BGR.
        return cast(ImageArray, image)
    raise ValueError("La imagen preprocesada debe tener 1 o 3 canales.")


def gray_bgr(image: ImageArray) -> ImageArray:
    """Convierte una imagen BGR a escala de grises manteniendo 3 canales."""
    gray = cv2.cvtColor(ensure_bgr(image), cv2.COLOR_BGR2GRAY)
    return ensure_bgr(cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR))


def resize_bgr(image: ImageArray, *, scale: float) -> ImageArray:
    """Reescala una imagen BGR con interpolación cúbica."""
    if scale <= 0:
        raise ValueError("El factor de reescalado debe ser mayor que 0.")
    source = ensure_bgr(image)
    height, width = source.shape[:2]
    target_size = (
        max(1, round(width * scale)),
        max(1, round(height * scale)),
    )
    return ensure_bgr(cv2.resize(source, target_size, interpolation=cv2.INTER_CUBIC))


def clahe_bgr(
    image: ImageArray,
    *,
    clip_limit: float,
    tile_size: int,
) -> ImageArray:
    """Aplica CLAHE sobre luminancia en gris y devuelve BGR de 3 canales."""
    if clip_limit <= 0:
        raise ValueError("El límite de contraste CLAHE debe ser mayor que 0.")
    if tile_size < 1:
        raise ValueError("El tamaño de mosaico CLAHE debe ser mayor o igual que 1.")
    gray = cv2.cvtColor(ensure_bgr(image), cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_size, tile_size))
    return ensure_bgr(cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR))


def _new_temp_path() -> str:
    return os.path.join(
        tempfile.gettempdir(),
        f"manualito_ocr_preprocessed_{uuid.uuid4().hex}{TEMP_IMAGE_EXTENSION}",
    )
