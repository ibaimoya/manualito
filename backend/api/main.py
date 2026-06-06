from contextlib import asynccontextmanager

from fastapi import FastAPI
from slowapi.middleware import SlowAPIMiddleware

from api import dependencies
from api.auth.router import router as auth_router
from api.config import settings
from api.conversations.router import router as conversations_router
from api.exceptions import register_exception_handlers
from api.games.router import router as games_router
from api.health.router import router as health_router
from api.manuals.router import router as manuals_router
from api.ocr.router import router as ocr_router
from api.rate_limit import limiter
from api.root.router import router as root_router
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


app = FastAPI(title="Manualito API", version=settings.app_version, lifespan=lifespan)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
register_exception_handlers(app)


app.include_router(root_router)
app.include_router(health_router, tags=["Health"])
app.include_router(auth_router, tags=["Authentication"])
app.include_router(ocr_router, tags=["OCR"])
app.include_router(games_router, tags=["Games"])
app.include_router(manuals_router, tags=["Manuals"])
app.include_router(conversations_router, tags=["Conversations"])
