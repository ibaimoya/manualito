from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class LlmError(Exception):
    """Clase base abstracta para los errores de dominio del servicio LLM."""


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


def llm_unavailable_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=502, content={"detail": "Servicio LLM no disponible."})


def llm_timeout_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=504,
        content={"detail": "El LLM tardó demasiado en responder."},
    )


def llm_generation_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al generar la respuesta con el LLM."},
    )


def invalid_llm_response_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=502, content={"detail": "Respuesta no válida del LLM."})


def empty_llm_answer_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "El LLM no devolvió una respuesta válida."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio LLM."""
    app.add_exception_handler(LlmUnavailableError, llm_unavailable_handler)
    app.add_exception_handler(LlmTimeoutError, llm_timeout_handler)
    app.add_exception_handler(LlmGenerationError, llm_generation_handler)
    app.add_exception_handler(InvalidLlmResponseError, invalid_llm_response_handler)
    app.add_exception_handler(EmptyLlmAnswerError, empty_llm_answer_handler)
