ARG OCR_RUNTIME_STAGE=tesseract

FROM python-base AS ocr-base

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock /app/

# Tesseract
FROM ocr-base AS tesseract

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

RUN uv sync --locked --no-install-project --no-default-groups \
    --only-group ocr \
    --only-group ocr-tesseract

# Paddle CPU
FROM ocr-base AS paddle_cpu

RUN uv sync --locked --no-install-project --no-default-groups \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-cpu

# Paddle GPU
FROM ocr-base AS paddle_gpu

RUN uv sync --locked --no-install-project --no-default-groups \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-gpu

# Etapa común de ejecución
FROM ${OCR_RUNTIME_STAGE} AS runtime

COPY backend/common/ /app/common/
COPY backend/ocr/ /app/

EXPOSE 8001

# Tener un start-period amplio para dar margen a cargar los modelos.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8001"]
