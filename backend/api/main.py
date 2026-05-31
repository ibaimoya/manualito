from contextlib import asynccontextmanager

from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware

from api import dependencies
from api.exceptions import register_exception_handlers
from api.rate_limit import limiter
from api.routes import auth, health, manuals, ocr
from common.logging import configure_logging, install_health_log_filter
from database.session import dispose_engine

configure_logging()
install_health_log_filter()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Crea el ``httpx.AsyncClient`` compartido y lo cierra al parar el servicio."""
    await dependencies.start_http_client()
    try:
        yield
    finally:
        try:
            await dependencies.close_http_client()
        finally:
            await dispose_engine()


app = FastAPI(title="Manualito API", lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
register_exception_handlers(app)
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router, tags=["Auth"])
app.include_router(ocr.router, tags=["OCR"])
app.include_router(manuals.router, tags=["Manuals"])
