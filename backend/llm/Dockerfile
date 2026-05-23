# syntax=docker/dockerfile:1

ARG PYTHON_BASE_TAG

FROM python-base:${PYTHON_BASE_TAG}

LABEL org.opencontainers.image.title="manualito-llm" \
      org.opencontainers.image.description="Servicio LLM de Manualito conectado a Ollama."

COPY --chown=root:root --chmod=0644 pyproject.toml uv.lock /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --no-build --only-group llm

COPY --chown=root:root --chmod=u=rwX,go=rX backend/common/ /app/common/
COPY --chown=root:root --chmod=u=rwX,go=rX backend/llm/ /app/

RUN find /app -path /app/.venv -prune -o -type d -exec chmod 0755 {} + \
    && find /app -path /app/.venv -prune -o -type f -exec chmod 0644 {} + \
    && rm -f /usr/local/bin/uv /usr/local/bin/uvx \
        /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.* \
        /app/.venv/bin/pip /app/.venv/bin/pip3 /app/.venv/bin/pip3.* \
        /usr/bin/apt /usr/bin/apt-get /usr/bin/apt-cache /usr/bin/apt-config /usr/bin/apt-key /usr/bin/apt-mark \
    && rm -rf /root/.cache /var/cache/apt/* /var/lib/apt/lists/* /tmp/* /var/tmp/* \
    && usermod --shell /usr/sbin/nologin root

EXPOSE 8003

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=10 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8003/health', timeout=3).status == 200 else 1)"

USER appuser

CMD ["uvicorn", "llm_app:app", "--host", "0.0.0.0", "--port", "8003"]
