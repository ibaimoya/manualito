from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class OcrError(Exception):
    """Clase base para los errores esperados del servicio OCR."""

    status_code = 500
    detail = "Error interno al procesar la imagen con OCR."


class OcrProcessingError(OcrError):
    """El motor OCR ha fallado al procesar la imagen."""


class OcrImageTooLargeError(OcrError):
    """El cuerpo binario supera el límite admitido por OCR."""

    status_code = 413
    detail = "La imagen no puede superar 30 MB."


class OcrContentLengthMismatchError(OcrError):
    """El cuerpo recibido no coincide con su longitud declarada."""

    status_code = 400
    detail = "El tamaño recibido no coincide con Content-Length."


class OcrUnsupportedMediaTypeError(OcrError):
    """El tipo de contenido no representa una imagen admitida."""

    status_code = 415
    detail = "Content-Type de imagen no soportado."


def ocr_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, OcrError):
        raise TypeError("El handler OCR recibió una excepción incompatible")
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio OCR."""
    app.add_exception_handler(OcrError, ocr_error_handler)
