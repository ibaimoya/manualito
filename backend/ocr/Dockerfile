# syntax=docker/dockerfile:1

ARG OCR_RUNTIME_STAGE=tesseract
ARG PYTHON_BASE_TAG
ARG UV_VERSION

# Stage: uv.
FROM ghcr.io/astral-sh/uv:${UV_VERSION:?UV_VERSION_no_definida} AS uv

# Stage: base de dependencias OCR.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS ocr-deps-base

# Instala uv (https://docs.astral.sh/uv/) solo en el stage de dependencias.
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --chown=root:root --chmod=0644 pyproject.toml uv.lock /app/

# Stage: dependencias Tesseract.
FROM ocr-deps-base AS tesseract-deps

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-tesseract

# Stage: dependencias Paddle CPU.
FROM ocr-deps-base AS paddle-cpu-deps

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-cpu

# Stage: dependencias Paddle GPU.
FROM ocr-deps-base AS paddle-gpu-deps

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-gpu

# Stage: runtime Tesseract.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS tesseract

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgomp1 \
        tesseract-ocr \
        tesseract-ocr-spa \
    && rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY --from=tesseract-deps --chown=root:root /app/.venv /app/.venv

# Stage: runtime Paddle CPU.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS paddle_cpu

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY --from=paddle-cpu-deps --chown=root:root /app/.venv /app/.venv

# Stage: runtime Paddle GPU.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS paddle_gpu

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

COPY --from=paddle-gpu-deps --chown=root:root /app/.venv /app/.venv

# Stage: runtime final.
FROM ${OCR_RUNTIME_STAGE:?OCR_RUNTIME_STAGE_no_definida} AS runtime

USER root

LABEL org.opencontainers.image.title="manualito-ocr" \
      org.opencontainers.image.description="Servicio OCR de Manualito con soporte para Tesseract y PaddleOCR."

COPY --chown=root:root --chmod=0755 backend/common/ /app/common/
COPY --chown=root:root --chmod=0755 backend/ocr/ /app/ocr/

RUN mkdir -p /home/appuser/.paddlex \
    && chown -R appuser:appgroup /home/appuser/.paddlex \
    && find /app -path /app/.venv -prune -o -type d -exec chmod 0755 {} + \
    && find /app -path /app/.venv -prune -o -type f -exec chmod 0644 {} + \
    && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
    && rm -rf /root/.cache /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=3).status == 200 else 1)"

USER appuser

CMD ["uvicorn", "ocr.main:app", "--host", "0.0.0.0", "--port", "8001"]
