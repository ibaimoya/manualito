"""Contratos de la respuesta del servicio OCR interno."""

from api.schemas import StrictModel


class OcrLine(StrictModel):
    """Línea OCR tal como la consume el pipeline de manuales."""

    text: str
    confidence: float


class OcrLinesResponse(StrictModel):
    """Respuesta JSON de ``POST /extract`` en el servicio OCR privado."""

    lines: list[OcrLine]
