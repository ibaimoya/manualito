ARG UV_VERSION=0.11.17
ARG PYTHON_VERSION=3.11.14-slim-bookworm
ARG VERSION=0.0.1

# Instala uv (https://docs.astral.sh/uv/).
FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# Instala la imagen base de python del backend.
FROM python:${PYTHON_VERSION}

ARG VERSION=0.0.1
ARG APP_UID=65532
ARG APP_GID=65532

LABEL org.opencontainers.image.authors="Ibai Moya Aroz" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.title="manualito-python-base" \
      org.opencontainers.image.description="Base Python compartida para los servicios backend de Manualito."

WORKDIR /app

ENV PATH="/app/.venv/bin:${PATH}" \
    HOME=/home/appuser \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/home/appuser/.cache \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

RUN groupadd --gid "${APP_GID}" appgroup \
    && useradd --uid "${APP_UID}" --gid appgroup \
               --create-home --home-dir /home/appuser \
               --shell /usr/sbin/nologin --no-log-init \
               appuser \
    && mkdir -p /home/appuser/.cache /app \
    && chown -R appuser:appgroup /home/appuser

COPY --from=uv /uv /uvx /usr/local/bin/
