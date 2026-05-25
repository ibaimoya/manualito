from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ManualNotFoundError(Exception):
    """Indica que un manual no tiene chunks indexados en la colección."""


class EmptyDocumentError(Exception):
    """El documento no contiene texto indexable tras normalizar."""


class ChunkGenerationError(Exception):
    """El documento normalizado no ha producido chunks."""


class RagIndexingError(Exception):
    """La ingesta ha fallado al vectorizar o persistir el manual."""


class RagRetrievalError(Exception):
    """La recuperación de contexto ha fallado de forma inesperada."""


def empty_document_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=422,
        content={"detail": "El documento no contiene texto indexable."},
    )


def chunk_generation_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=422,
        content={"detail": "No se pudieron generar chunks del documento."},
    )


def manual_not_found_handler(_request: Request, _exc: Exception):
    return JSONResponse(status_code=404, content={"detail": "Manual no encontrado."})


def rag_indexing_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al indexar el manual."},
    )


def rag_retrieval_handler(_request: Request, _exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno al recuperar el contexto del manual."},
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers globales del servicio RAG."""
    app.add_exception_handler(EmptyDocumentError, empty_document_handler)
    app.add_exception_handler(ChunkGenerationError, chunk_generation_handler)
    app.add_exception_handler(ManualNotFoundError, manual_not_found_handler)
    app.add_exception_handler(RagIndexingError, rag_indexing_handler)
    app.add_exception_handler(RagRetrievalError, rag_retrieval_handler)
