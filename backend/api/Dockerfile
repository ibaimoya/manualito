FROM python:3.11-slim

WORKDIR /app

# curl es necesario para que el HEALTHCHECK del contenedor pueda chequear /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY common/ /app/common/
COPY api/ /app/

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "api_app:app", "--host", "0.0.0.0", "--port", "8000"]
