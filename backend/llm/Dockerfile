FROM python:3.11-slim

WORKDIR /app

# curl es necesario para que el HEALTHCHECK del contenedor pueda chequear /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD curl -fsS http://localhost:8003/health || exit 1

CMD ["uvicorn", "llm_app:app", "--host", "0.0.0.0", "--port", "8003"]
