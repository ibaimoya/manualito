# Instala uv (https://docs.astral.sh/uv/).
FROM ghcr.io/astral-sh/uv:0.11.13 AS uv

# Instala la imagen base de python del backend.
FROM python:3.11.14-slim-bookworm

WORKDIR /app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# curl se necesita para hacer los HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/
