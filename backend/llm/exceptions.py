from collections.abc import Mapping
from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class LlmError(Exception):
    """Clase base para los errores de dominio del servicio LLM."""


class LlmUnavailableError(LlmError):
    """Ollama no acepta conexiones."""


class LlmTimeoutError(LlmError):
    """Ollama ha agotado el tiempo máximo de respuesta."""


class LlmGenerationError(LlmError):
    """Ollama ha devuelto un error HTTP durante la generación."""


class InvalidLlmResponseError(LlmError):
    """Ollama ha devuelto una respuesta no JSON."""


class EmptyLlmAnswerError(LlmError):
    """Ollama ha devuelto una respuesta vacía."""


@dataclass(frozen=True, slots=True)
class LlmErrorResponse:
    """Respuesta pública asociada a un error de dominio LLM."""

    status_code: int
    detail: str


_LLM_ERROR_RESPONSES: Mapping[type[Exception], LlmErrorResponse] = {
    LlmUnavailableError: LlmErrorResponse(
        status_code=502,
        detail="Servicio LLM no disponible.",
    ),
    LlmTimeoutError: LlmErrorResponse(
        status_code=504,
        detail="El LLM tardó demasiado en responder.",
    ),
    LlmGenerationError: LlmErrorResponse(
        status_code=500,
        detail="Error interno al generar la respuesta con el LLM.",
    ),
    InvalidLlmResponseError: LlmErrorResponse(
        status_code=502,
        detail="Respuesta no válida del LLM.",
    ),
    EmptyLlmAnswerError: LlmErrorResponse(
        status_code=500,
        detail="El LLM no devolvió una respuesta válida.",
    ),
}


def llm_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Traduce errores LLM al contrato HTTP interno del servicio."""
    response = _llm_error_response(exc)
    return JSONResponse(
        status_code=response.status_code,
        content={"detail": response.detail},
    )


def _llm_error_response(exc: Exception) -> LlmErrorResponse:
    """Busca respuesta por clase concreta o por un ancestro registrado."""
    for exception_type in type(exc).__mro__:
        if exception_type in _LLM_ERROR_RESPONSES:
            return _LLM_ERROR_RESPONSES[exception_type]
    raise TypeError(f"Excepción LLM no registrada: {type(exc).__name__}")


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio LLM."""
    for exception_type in _LLM_ERROR_RESPONSES:
        app.add_exception_handler(exception_type, llm_exception_handler)
