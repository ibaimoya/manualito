# syntax=docker/dockerfile:1

ARG PYTHON_BASE_TAG

FROM python-base:${PYTHON_BASE_TAG}

LABEL org.opencontainers.image.title="manualito-database" \
      org.opencontainers.image.description="Migraciones y modelos persistentes de Manualito."

COPY --chown=root:root --chmod=0644 pyproject.toml uv.lock /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build --only-group database

COPY --chown=root:root --chmod=0755 backend/database/ /app/database/

RUN find /app -path /app/.venv -prune -o -type d -exec chmod 0755 {} + \
    && find /app -path /app/.venv -prune -o -type f -exec chmod 0644 {} + \
    && rm -f /usr/local/bin/uv /usr/local/bin/uvx \
        /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
        /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /root/.cache /var/cache/apt/* /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

USER appuser

CMD ["alembic", "-c", "/app/database/alembic.ini", "upgrade", "head"]
