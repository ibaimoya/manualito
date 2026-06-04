# syntax=docker/dockerfile:1

ARG PYTHON_BASE_TAG
ARG UV_VERSION

# Stage: uv.
FROM ghcr.io/astral-sh/uv:${UV_VERSION:?UV_VERSION_no_definida} AS uv

# Stage: dependencias.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS deps

# Instala uv (https://docs.astral.sh/uv/) solo en el stage de dependencias.
COPY --link --from=uv /uv /uvx /usr/local/bin/
COPY --link --chown=0:0 --chmod=0644 pyproject.toml uv.lock /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build --only-group rag

# Stage: runtime.
FROM python-base:${PYTHON_BASE_TAG:?PYTHON_BASE_TAG_no_definida} AS runtime

LABEL org.opencontainers.image.title="manualito-rag" \
      org.opencontainers.image.description="Servicio RAG de Manualito para indexar y consultar manuales."

COPY --link --from=deps --chown=0:0 /app/.venv /app/.venv
COPY --link --chown=0:0 --chmod=0755 backend/common/ /app/common/
COPY --link --chown=0:0 --chmod=0755 backend/rag/ /app/rag/

RUN mkdir -p /home/appuser/.cache/huggingface \
    && chown -R appuser:appgroup /home/appuser/.cache/huggingface \
    && find /app -path /app/.venv -prune -o -type d -exec chmod 0755 {} + \
    && find /app -path /app/.venv -prune -o -type f -exec chmod 0644 {} + \
    && rm -f /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
        /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /root/.cache /var/cache/apt/* /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

EXPOSE 8002

# Tener un start-period amplio da tiempo al lifespan a cargar el modelo de embeddings.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=3).status == 200 else 1)"

USER appuser

CMD ["uvicorn", "rag.main:app", "--host", "0.0.0.0", "--port", "8002"]
