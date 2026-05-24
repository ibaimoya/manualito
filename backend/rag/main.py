from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from common.logging import configure_logging, install_health_log_filter
from rag.embeddings import get_embedding_service
from rag.exceptions import register_exception_handlers
from rag.repository import get_repository
from rag.router import router

configure_logging()
logger = logging.getLogger(__name__)

install_health_log_filter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Prepara el servicio RAG antes de aceptar tráfico.

    Carga el modelo de embeddings desde disco (evita que la primera request
    pague el coste de la carga) e inicializa la conexión con ChromaDB. Así
    las singleton quedan pobladas antes de que el servidor acepte peticiones,
    lo que también elimina la race condition teórica entre tareas
    concurrentes que se ejecuten en el thread pool tras un ``asyncio.to_thread``.
    """
    logger.info("Pre-cargando modelo de embeddings y cliente ChromaDB...")
    await asyncio.to_thread(get_embedding_service()._load_model)
    await asyncio.to_thread(get_repository()._get_collection)
    logger.info("Servicio RAG listo.")
    yield


app = FastAPI(title="Manualito RAG Service", lifespan=lifespan)
register_exception_handlers(app)
app.include_router(router)
