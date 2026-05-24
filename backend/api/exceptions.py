from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ImageTooLargeError(Exception):
    """La imagen subida supera el tamaño máximo permitido por el gateway."""


class InvalidImageError(Exception):
    """El fichero subido no contiene una imagen válida."""


class InternalServiceUnavailableError(Exception):
    """Un servicio interno no está disponible."""

    def __init__(self, detail: str):
        self.detail = detail


class InternalResourceNotFoundError(Exception):
    """Un servicio interno indica que el recurso solicitado no existe."""

    def __init__(self, detail: str):
        self.detail = detail


class InternalServiceError(Exception):
    """Un servicio interno ha devuelto un error no recuperable."""

    def __init__(self, detail: str):
        self.detail = detail


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Normaliza las respuestas 422 del gateway.

    Handler puro: traduce la excepción a respuesta HTTP sin loguear. El
    rastro de las peticiones inválidas queda en el access log de Uvicorn.

    Args:
        request (Request): Petición original.
        exc (RequestValidationError): Error de validación emitido por FastAPI.

    Returns:
        JSONResponse: Mensaje uniforme de parámetros inválidos.
    """
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})


async def image_too_large_handler(request: Request, exc: ImageTooLargeError):
    return JSONResponse(
        status_code=413,
        content={"detail": "La imagen no puede superar 20 MB."},
    )


async def invalid_image_handler(request: Request, exc: InvalidImageError):
    return JSONResponse(
        status_code=415,
        content={"detail": "El archivo no es una imagen válida."},
    )


async def internal_service_unavailable_handler(
    request: Request,
    exc: InternalServiceUnavailableError,
):
    return JSONResponse(status_code=502, content={"detail": exc.detail})


async def internal_resource_not_found_handler(
    request: Request,
    exc: InternalResourceNotFoundError,
):
    return JSONResponse(status_code=404, content={"detail": exc.detail})


async def internal_service_error_handler(request: Request, exc: InternalServiceError):
    return JSONResponse(status_code=500, content={"detail": exc.detail})


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del gateway."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ImageTooLargeError, image_too_large_handler)
    app.add_exception_handler(InvalidImageError, invalid_image_handler)
    app.add_exception_handler(
        InternalServiceUnavailableError,
        internal_service_unavailable_handler,
    )
    app.add_exception_handler(
        InternalResourceNotFoundError,
        internal_resource_not_found_handler,
    )
    app.add_exception_handler(InternalServiceError, internal_service_error_handler)
