ARG OCR_RUNTIME_STAGE=paddle-cpu

FROM python:3.11-slim AS ocr-base

ARG UV_VERSION=0.11.13

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Instalar uv (https://docs.astral.sh/uv/)
ADD https://astral.sh/uv/${UV_VERSION}/install.sh /uv-installer.sh
RUN sh /uv-installer.sh && rm /uv-installer.sh
ENV PATH="/root/.local/bin:${PATH}"

COPY ocr/requirements.txt requirements.txt
RUN mkdir -p engines/paddle
COPY ocr/engines/paddle/requirements.txt engines/paddle/requirements.txt

# Paddle CPU
FROM ocr-base AS paddle-cpu

RUN mkdir -p engines/paddle/cpu
COPY ocr/engines/paddle/cpu/requirements.txt engines/paddle/cpu/requirements.txt
RUN uv pip install --system -r engines/paddle/cpu/requirements.txt

# Paddle GPU
FROM ocr-base AS paddle-gpu

RUN uv pip install --system -r engines/paddle/requirements.txt
RUN uv pip install --system \
    --index-url https://www.paddlepaddle.org.cn/packages/stable/cu118/ \
    paddlepaddle-gpu==3.2.0

# Runtime común
FROM ${OCR_RUNTIME_STAGE} AS runtime

COPY common/ /app/common/
COPY ocr/ /app/

EXPOSE 8001

# start-period amplio para dar margen a cargar los modelos.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8001"]
