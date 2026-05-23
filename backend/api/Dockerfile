ARG PYTHON_BASE_TAG

FROM python-base:${PYTHON_BASE_TAG}

LABEL org.opencontainers.image.title="manualito-api" \
      org.opencontainers.image.description="Gateway HTTP de Manualito para coordinar OCR, RAG y LLM."

COPY --chown=appuser:appgroup pyproject.toml uv.lock /app/
USER appuser
RUN uv sync --locked --no-install-project --no-default-groups --no-build --only-group api

USER root
COPY --chown=appuser:appgroup backend/common/ /app/common/
COPY --chown=appuser:appgroup backend/api/ /app/

RUN rm -f /usr/local/bin/uv /usr/local/bin/uvx \
        /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
        /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /root/.cache /var/cache/apt/* /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=3).status == 200 else 1)"

USER appuser

CMD ["uvicorn", "api_app:app", "--host", "0.0.0.0", "--port", "8000"]
