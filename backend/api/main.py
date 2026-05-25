from contextlib import asynccontextmanager

from fastapi import FastAPI

from api import dependencies
from api.exceptions import register_exception_handlers
from api.routes import health, manuals, ocr
from common.logging import configure_logging, install_health_log_filter

configure_logging()
install_health_log_filter()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Crea el ``httpx.AsyncClient`` compartido y lo cierra al parar el servicio."""
    await dependencies.start_http_client()
    try:
        yield
    finally:
        await dependencies.close_http_client()


app = FastAPI(title="Manualito API", lifespan=lifespan)
register_exception_handlers(app)
app.include_router(health.router, tags=["Health"])
app.include_router(ocr.router, tags=["OCR"])
app.include_router(manuals.router, tags=["Manuals"])
