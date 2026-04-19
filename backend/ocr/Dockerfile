FROM python:3.11-slim

WORKDIR /app

# System deps for PaddleOCR (OpenCV, libGL, etc.) + curl para el HEALTHCHECK.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# start-period amplio para dar margen a PaddleOCR a cargar los modelos la
# primera vez que se levanta el contenedor (descarga a /root/.paddlex).
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
    CMD curl -fsS http://localhost:8001/health || exit 1

CMD ["uvicorn", "ocr_app:app", "--host", "0.0.0.0", "--port", "8001"]
