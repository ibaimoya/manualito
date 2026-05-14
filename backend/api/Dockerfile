FROM python-base

COPY pyproject.toml uv.lock /app/
RUN uv sync --locked --no-install-project --no-default-groups --only-group api

COPY backend/common/ /app/common/
COPY backend/api/ /app/

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "api_app:app", "--host", "0.0.0.0", "--port", "8000"]
