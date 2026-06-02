"""Validación segura de imágenes de manual."""

from dataclasses import dataclass
from io import BytesIO

import anyio
from fastapi import UploadFile
from PIL import Image

from api import config
from api.exceptions import ImageTooLargeError, InvalidImageError
from common.crypto import sha256_hex

JPEG_MIME_TYPE = "image/jpeg"
PNG_MIME_TYPE = "image/png"
WEBP_MIME_TYPE = "image/webp"

ALLOWED_IMAGE_MIME_TYPES = {
    JPEG_MIME_TYPE,
    PNG_MIME_TYPE,
    WEBP_MIME_TYPE,
}

IMAGE_FORMAT_TO_MIME = {
    "JPEG": JPEG_MIME_TYPE,
    "MPO": JPEG_MIME_TYPE,
    "PNG": PNG_MIME_TYPE,
    "WEBP": WEBP_MIME_TYPE,
}

IMAGE_MIME_TO_EXTENSION = {
    JPEG_MIME_TYPE: ".jpg",
    PNG_MIME_TYPE: ".png",
    WEBP_MIME_TYPE: ".webp",
}


@dataclass(frozen=True, slots=True)
class ValidatedManualImage:
    """Imagen validada y lista para storage/OCR."""

    content: bytes
    mime_type: str
    extension: str
    width: int
    height: int
    sha256: str


async def validate_manual_image(image: UploadFile) -> ValidatedManualImage:
    """Valida tamaño, MIME declarado y firma real de la imagen."""
    content = await image.read(config.MAX_IMAGE_SIZE + 1)
    return await anyio.to_thread.run_sync(
        _validate_manual_image_content,
        content,
        image.content_type,
    )


def _validate_manual_image_content(
    content: bytes,
    declared_mime_type: str | None,
) -> ValidatedManualImage:
    """Ejecuta la validación CPU-bound fuera del event loop."""
    if len(content) > config.MAX_IMAGE_SIZE:
        raise ImageTooLargeError
    if declared_mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise InvalidImageError

    try:
        with Image.open(BytesIO(content)) as candidate:
            candidate.verify()
        with Image.open(BytesIO(content)) as verified:
            mime_type = IMAGE_FORMAT_TO_MIME[verified.format]
            width, height = verified.size
    except (KeyError, OSError):
        raise InvalidImageError from None

    if mime_type != declared_mime_type:
        raise InvalidImageError

    return ValidatedManualImage(
        content=content,
        mime_type=mime_type,
        extension=_extension_for_mime(mime_type),
        width=width,
        height=height,
        sha256=sha256_hex(content),
    )


def _extension_for_mime(mime_type: str) -> str:
    """Devuelve una extensión controlada para el storage."""
    return IMAGE_MIME_TO_EXTENSION[mime_type]
