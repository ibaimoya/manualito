"""Schemas públicos de OCR expuestos por el gateway."""

from api.schemas import StrictModel


class OcrLine(StrictModel):
    """Linea OCR tal como la consume el gateway desde el servicio OCR."""

    text: str
    confidence: float


class OcrLinesResponse(StrictModel):
    """Respuesta JSON de ``POST /api/ocr``."""

    lines: list[OcrLine]
