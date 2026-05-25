import logging
from typing import Protocol, TypedDict


class OcrLine(TypedDict):
    """Línea de texto normalizada devuelta por cualquier motor OCR."""

    text: str
    confidence: float


class OcrEngine(Protocol):
    """
    Contrato común para aplicar Strategy con motores OCR intercambiables.

    Cada implementación concreta decide cómo extraer texto, pero todas deben
    devolver el mismo formato normalizado.
    """

    name: str

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """Extrae texto de una imagen y devuelve líneas normalizadas."""
        raise NotImplementedError


def log_ocr_result(
    logger: logging.Logger,
    image_path: str,
    lines: list[OcrLine],
) -> None:
    """Registra el resultado de una extracción OCR."""
    if not lines:
        logger.warning("OCR completado sin líneas detectadas: %s", image_path)
    else:
        logger.info("OCR completado: %d líneas detectadas.", len(lines))
