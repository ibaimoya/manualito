from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class RagError(Exception):
    """Clase base abstracta para los errores de dominio del servicio RAG."""


class ContextNotFoundError(RagError):
    """Indica que un juego no tiene chunks indexados en la colección."""


class RagIndexingError(RagError):
    """La ingesta ha fallado al vectorizar o persistir el manual."""


class RagRetrievalError(RagError):
    """La recuperación de contexto ha fallado de forma inesperada."""


class RagDeletionError(RagError):
    """El borrado de chunks derivados ha fallado de forma inesperada."""


def context_not_found_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=404, content={"detail": "Contexto no encontrado."})


def rag_indexing_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al indexar el manual."},
    )


def rag_retrieval_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al recuperar el contexto del juego."},
    )


def rag_deletion_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al borrar el manual del índice."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio RAG."""
    app.add_exception_handler(ContextNotFoundError, context_not_found_handler)
    app.add_exception_handler(RagIndexingError, rag_indexing_handler)
    app.add_exception_handler(RagRetrievalError, rag_retrieval_handler)
    app.add_exception_handler(RagDeletionError, rag_deletion_handler)
