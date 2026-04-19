from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException
from prompt_builder import build_prompt
from pydantic import BaseModel, ConfigDict, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi4:14b")
OLLAMA_TIMEOUT = 120.0

_http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Arranca y cierra recursos compartidos del servicio LLM.

    Crea un único ``httpx.AsyncClient`` con timeout por defecto y pooling de
    conexiones para todas las llamadas a Ollama. Además verifica al arrancar
    si el modelo configurado (``OLLAMA_MODEL``) está disponible, emitiendo
    un warning si no — sin detener el servicio — para facilitar el
    diagnóstico desde ``docker compose logs llm``.
    """
    global _http_client
    _http_client = httpx.AsyncClient(timeout=OLLAMA_TIMEOUT)
    await _warn_if_model_missing(_http_client)
    try:
        yield
    finally:
        await _http_client.aclose()
        _http_client = None


async def _warn_if_model_missing(client: httpx.AsyncClient) -> None:
    """
    Comprueba contra ``/api/tags`` si el modelo configurado existe en Ollama.

    No lanza excepciones: cualquier fallo (Ollama aún no arrancado, timeout,
    etc.) se registra como warning y el servicio sigue en pie. La primera
    request real del usuario dará el error informativo si el modelo no está.
    """
    try:
        response = await client.get(f"{OLLAMA_URL}/api/tags", timeout=10.0)
        response.raise_for_status()
        models = [m.get("name") for m in response.json().get("models", [])]
        if OLLAMA_MODEL not in models:
            logger.warning(
                "Modelo '%s' no encontrado en Ollama. Modelos disponibles: %s",
                OLLAMA_MODEL,
                models,
            )
        else:
            logger.info("Modelo '%s' disponible en Ollama.", OLLAMA_MODEL)
    except Exception:
        logger.warning(
            "No se pudo verificar la disponibilidad del modelo en %s al arrancar.",
            OLLAMA_URL,
            exc_info=True,
        )


def get_http_client() -> httpx.AsyncClient:
    """Dependencia FastAPI que expone el cliente HTTP compartido del proceso."""
    if _http_client is None:  # Solo ocurre si alguien llama al endpoint sin lifespan.
        raise RuntimeError("El cliente HTTP aún no se ha inicializado.")
    return _http_client


app = FastAPI(title="Manualito LLM Service", lifespan=lifespan)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: Annotated[str, Field(min_length=1)]
    context_chunks: Annotated[list[str], Field(min_length=1)]
    manual_id: str | None = None


@app.get("/health")
async def health():
    """Comprueba que el servicio LLM está disponible."""
    return {"status": "ok"}


@app.post("/generate")
async def generate_endpoint(
    payload: GenerateRequest,
    client: httpx.AsyncClient = Depends(get_http_client),
):
    """
    Genera una respuesta usando Ollama a partir de una pregunta y su contexto.

    Args:
        payload (GenerateRequest): Pregunta del usuario y chunks relevantes.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        dict: Respuesta final limpia generada por el LLM.

    Raises:
        HTTPException: 502 si Ollama no responde; 504 si se agota el timeout;
                       500 si falla la generación o la respuesta no es válida.
    """
    prompt, included_chunks = build_prompt(payload.question, payload.context_chunks)
    total_chunks = len(payload.context_chunks)
    if included_chunks < total_chunks:
        logger.warning(
            "Prompt recortado por presupuesto: %d/%d chunks incluidos.",
            included_chunks,
            total_chunks,
        )

    start = time.perf_counter()
    logger.info(
        "Generando respuesta: modelo=%s, prompt_chars=%d, chunks=%d.",
        OLLAMA_MODEL,
        len(prompt),
        included_chunks,
    )

    try:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.2, "num_ctx": 8192},
            },
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.ConnectError:
        logger.error("No se pudo conectar con Ollama en %s.", OLLAMA_URL)
        raise HTTPException(status_code=502, detail="Servicio LLM no disponible.") from None
    except httpx.TimeoutException:
        logger.error("Ollama no respondió en %ss.", OLLAMA_TIMEOUT)
        raise HTTPException(
            status_code=504,
            detail="El LLM tardó demasiado en responder.",
        ) from None
    except httpx.HTTPStatusError as llm_err:
        logger.error("Ollama devolvió un error HTTP.", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error interno al generar la respuesta con el LLM.",
        ) from llm_err

    try:
        body = response.json()
    except (ValueError, json.JSONDecodeError):
        logger.error("Respuesta JSON inválida de Ollama.", exc_info=True)
        raise HTTPException(
            status_code=502,
            detail="Respuesta no válida del LLM.",
        ) from None

    answer = (body.get("response") or "").strip()
    if not answer:
        raise HTTPException(
            status_code=500,
            detail="El LLM no devolvió una respuesta válida.",
        )

    elapsed = time.perf_counter() - start
    logger.info(
        "Respuesta generada en %.2fs (answer_chars=%d).",
        elapsed,
        len(answer),
    )
    return {"answer": answer}
