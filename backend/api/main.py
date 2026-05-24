import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from api import dependencies
from api.exceptions import register_exception_handlers
from api.router import router
from common.filters import install_health_log_filter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)

# Silencia los sondeos sanos repetidos de /health en los logs de uvicorn.
install_health_log_filter()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Crea el ``httpx.AsyncClient`` compartido y lo cierra al parar el servicio."""
    await dependencies.start_http_client()
    try:
        yield
    finally:
        await dependencies.close_http_client()


app = FastAPI(title="Manualito API", lifespan=lifespan)
register_exception_handlers(app)
app.include_router(router)
