from contextlib import asynccontextmanager

from fastapi import FastAPI

from common.logging import configure_logging, install_health_log_filter
from llm import dependencies
from llm.client import prepare_model_on_startup
from llm.exceptions import register_exception_handlers
from llm.router import router

configure_logging()
install_health_log_filter()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Arranca y cierra recursos compartidos del servicio LLM.

    Crea un único ``httpx.AsyncClient`` con timeout por defecto y pooling de
    conexiones para todas las llamadas a Ollama. Además, verifica al arrancar
    si el modelo configurado (``OLLAMA_MODEL``) está disponible y lo precarga
    cuando ``OLLAMA_PRELOAD_ON_STARTUP`` está activo.
    """
    await dependencies.start_http_client()
    await prepare_model_on_startup(dependencies.get_http_client())
    try:
        yield
    finally:
        await dependencies.close_http_client()


app = FastAPI(title="Manualito LLM Service", lifespan=lifespan)
register_exception_handlers(app)
app.include_router(router, tags=["LLM"])
