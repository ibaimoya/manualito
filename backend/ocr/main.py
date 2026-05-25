from fastapi import FastAPI

from common.logging import configure_logging, install_health_log_filter
from ocr.exceptions import register_exception_handlers
from ocr.router import router

configure_logging()
install_health_log_filter()

app = FastAPI(title="Manualito OCR Service")
register_exception_handlers(app)
app.include_router(router, tags=["OCR"])
