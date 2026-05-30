import os

MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20 MB
OCR_URL = os.environ["OCR_URL"]
RAG_URL = os.environ["RAG_URL"]
LLM_URL = os.environ["LLM_URL"]
LLM_UNLOAD_BEFORE_OCR = os.getenv("LLM_UNLOAD_BEFORE_OCR", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
LLM_UNLOAD_TIMEOUT = 5.0
OCR_SERVICE_TIMEOUT = 300.0
INTERNAL_JSON_TIMEOUT = 120.0

AUTH_SESSION_DAYS = 7
AUTH_SESSION_MAX_AGE_SECONDS = AUTH_SESSION_DAYS * 24 * 60 * 60
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
AUTH_SESSION_COOKIE_NAME = os.getenv(
    "AUTH_SESSION_COOKIE_NAME",
    "__Host-manualito_session" if AUTH_COOKIE_SECURE else "manualito_session",
)
AUTH_CSRF_COOKIE_NAME = os.getenv(
    "AUTH_CSRF_COOKIE_NAME",
    "__Host-manualito_csrf" if AUTH_COOKIE_SECURE else "manualito_csrf",
)
AUTH_CSRF_HEADER_NAME = "X-CSRF-Token"
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128
