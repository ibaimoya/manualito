FROM python-base

COPY pyproject.toml uv.lock /app/
RUN uv sync --locked --no-install-project --no-default-groups --no-build --only-group llm

COPY backend/common/ /app/common/
COPY backend/llm/ /app/

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -fsS http://localhost:8003/health || exit 1

CMD ["uvicorn", "llm_app:app", "--host", "0.0.0.0", "--port", "8003"]
