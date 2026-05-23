ARG OCR_RUNTIME_STAGE=tesseract
ARG PYTHON_BASE_TAG

FROM python-base:${PYTHON_BASE_TAG} AS ocr-base

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=appuser:appgroup pyproject.toml uv.lock /app/

# Tesseract
FROM ocr-base AS tesseract

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

USER appuser
RUN uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-tesseract
USER root

# Paddle CPU
FROM ocr-base AS paddle_cpu

USER appuser
RUN uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-cpu
USER root

# Paddle GPU
FROM ocr-base AS paddle_gpu

USER appuser
RUN uv sync --locked --no-install-project --no-default-groups --no-build \
    --only-group ocr \
    --only-group ocr-paddle \
    --only-group ocr-paddle-gpu
USER root

# Etapa común de ejecución
FROM ${OCR_RUNTIME_STAGE} AS runtime

USER root

LABEL org.opencontainers.image.title="manualito-ocr" \
      org.opencontainers.image.description="Servicio OCR de Manualito con soporte para Tesseract y PaddleOCR."

COPY --chown=appuser:appgroup backend/common/ /app/common/
COPY --chown=appuser:appgroup backend/ocr/ /app/

RUN mkdir -p /home/appuser/.paddlex \
    && chown -R appuser:appgroup /home/appuser/.paddlex \
    && rm -f /usr/local/bin/uv /usr/local/bin/uvx \
        /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
        /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /root/.cache /var/cache/apt/* /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

EXPOSE 8001

# Tener un start-period amplio para dar margen a cargar los modelos.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8001/health', timeout=3).status == 200 else 1)"

USER appuser

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8001"]
