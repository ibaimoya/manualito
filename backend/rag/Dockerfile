FROM python:3.11-slim

WORKDIR /app

# curl es necesario para que el HEALTHCHECK del contenedor pueda chequear /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8002

# start-period amplio para dar tiempo a que el lifespan cargue el modelo
# de embeddings antes de empezar a contar reintentos fallidos.
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD curl -fsS http://localhost:8002/health || exit 1

CMD ["uvicorn", "rag_app:app", "--host", "0.0.0.0", "--port", "8002"]
