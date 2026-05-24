import logging

from fastapi import FastAPI

from common.filters import install_health_log_filter
from ocr.exceptions import register_exception_handlers
from ocr.router import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)

# Silencia los sondeos sanos repetidos de /health en los logs de uvicorn.
install_health_log_filter()

app = FastAPI(title="Manualito OCR Service")
register_exception_handlers(app)
app.include_router(router)
