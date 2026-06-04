ARG PYTHON_VERSION

# Stage: runtime base.
FROM python:${PYTHON_VERSION:?PYTHON_VERSION_no_definida}

ARG VERSION
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
