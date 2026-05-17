FROM python-base

COPY pyproject.toml uv.lock /app/
RUN uv sync --locked --no-install-project --no-default-groups --no-build --only-group rag

COPY backend/common/ /app/common/
COPY backend/rag/ /app/

EXPOSE 8002

# Tener un start-period amplio da tiempo al lifespan a cargar el modelo de embeddings.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD curl -fsS http://localhost:8002/health || exit 1

CMD ["uvicorn", "rag_app:app", "--host", "0.0.0.0", "--port", "8002"]
