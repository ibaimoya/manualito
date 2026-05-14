FROM ghcr.io/astral-sh/uv:0.11.13 AS uv

FROM python:3.11.14-slim-bookworm

WORKDIR /app

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# curl se necesita para hacer el HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

COPY pyproject.toml uv.lock /app/
RUN uv sync --locked --no-install-project --no-default-groups --only-group llm

COPY backend/common/ /app/common/
COPY backend/llm/ /app/

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -fsS http://localhost:8003/health || exit 1

CMD ["uvicorn", "llm_app:app", "--host", "0.0.0.0", "--port", "8003"]
