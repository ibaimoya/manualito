from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class OcrError(Exception):
    """Clase base abstracta para los errores de dominio del servicio OCR."""


class OcrProcessingError(OcrError):
    """El motor OCR ha fallado al procesar la imagen."""


def ocr_processing_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al procesar la imagen con OCR."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio OCR."""
    app.add_exception_handler(OcrProcessingError, ocr_processing_handler)
