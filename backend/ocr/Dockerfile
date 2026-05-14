ARG OCR_RUNTIME_STAGE=paddle-cpu

# Instalar uv (https://docs.astral.sh/uv/)
FROM ghcr.io/astral-sh/uv:0.11.13 AS uv

FROM python:3.11.14-slim-bookworm AS ocr-base

WORKDIR /app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

COPY pyproject.toml uv.lock /app/

# Paddle CPU
FROM ocr-base AS paddle-cpu

RUN uv sync --locked --no-install-project --no-default-groups \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-cpu

# Paddle GPU
FROM ocr-base AS paddle-gpu

RUN uv sync --locked --no-install-project --no-default-groups \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-gpu

# Etapa comun de ejecucion
FROM ${OCR_RUNTIME_STAGE} AS runtime

COPY backend/common/ /app/common/
COPY backend/ocr/ /app/

EXPOSE 8001

# Tener un start-period amplio para dar margen a cargar los modelos.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8001"]
