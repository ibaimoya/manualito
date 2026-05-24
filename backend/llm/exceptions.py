from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class LlmUnavailableError(Exception):
    """Ollama no acepta conexiones."""


class LlmTimeoutError(Exception):
    """Ollama ha agotado el tiempo máximo de respuesta."""


class LlmGenerationError(Exception):
    """Ollama ha devuelto un error HTTP durante la generación."""


class InvalidLlmResponseError(Exception):
    """Ollama ha devuelto una respuesta no JSON."""


class EmptyLlmAnswerError(Exception):
    """Ollama ha devuelto una respuesta vacía."""


async def llm_unavailable_handler(request: Request, exc: LlmUnavailableError):
    return JSONResponse(status_code=502, content={"detail": "Servicio LLM no disponible."})


async def llm_timeout_handler(request: Request, exc: LlmTimeoutError):
    return JSONResponse(
        status_code=504,
        content={"detail": "El LLM tardó demasiado en responder."},
    )


async def llm_generation_handler(request: Request, exc: LlmGenerationError):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al generar la respuesta con el LLM."},
    )


async def invalid_llm_response_handler(request: Request, exc: InvalidLlmResponseError):
    return JSONResponse(status_code=502, content={"detail": "Respuesta no válida del LLM."})


async def empty_llm_answer_handler(request: Request, exc: EmptyLlmAnswerError):
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
