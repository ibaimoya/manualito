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
