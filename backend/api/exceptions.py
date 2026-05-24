import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Normaliza las respuestas 422 del gateway.

    Args:
        request (Request): Petición original.
        exc (RequestValidationError): Error de validación emitido por FastAPI.

    Returns:
        JSONResponse: Mensaje uniforme de parámetros inválidos.
    """
    logger.warning("Parámetros inválidos en %s: %s", request.url, exc.errors())
    return JSONResponse(status_code=422, content={"detail": "Parámetros inválidos."})


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del gateway."""
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
