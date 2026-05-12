from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from common.filters import install_health_log_filter
from fastapi import Depends, FastAPI, HTTPException
from prompt_builder import build_prompt
from pydantic import BaseModel, ConfigDict, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Silencia los sondeos sanos repetidos de /health en los logs de uvicorn.
install_health_log_filter()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi4:14b")
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE")
OLLAMA_TIMEOUT = 120.0

_http_client: httpx.AsyncClient | None = None
_active_generations = 0
_active_generations_lock = asyncio.Lock()


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


def _ollama_model_matches(model_payload: dict) -> bool:
    """Indica si una entrada de Ollama corresponde al modelo configurado."""
    model_names = {model_payload.get("name"), model_payload.get("model")}
    return OLLAMA_MODEL in model_names


async def _mark_generation_started() -> None:
    """Registra el inicio de una generacion para evitar descargas concurrentes."""
    global _active_generations
    async with _active_generations_lock:
        _active_generations += 1


async def _mark_generation_finished() -> None:
    """Registra el fin de una generacion LLM en curso."""
    global _active_generations
    async with _active_generations_lock:
        _active_generations = max(0, _active_generations - 1)


async def _get_active_generations() -> int:
    """Devuelve el numero de generaciones activas sin retener el lock."""
    async with _active_generations_lock:
        return _active_generations


@app.get("/health")
async def health():
    """Comprueba que el servicio LLM está disponible."""
    return {"status": "ok"}


@app.post("/unload-if-idle")
async def unload_if_idle_endpoint(
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
):
    """
    Descarga el modelo de Ollama si no hay generacion activa.

    Lo usa el gateway antes de un OCR potencialmente pesado para liberar VRAM
    a PaddleOCR GPU. Es deliberadamente best-effort: si Ollama no responde, no
    debe romper el flujo de OCR.
    """
    active_generations = await _get_active_generations()
    if active_generations > 0:
        return {
            "status": "busy",
            "unloaded": False,
            "active_generations": active_generations,
        }

    try:
        ps_response = await client.get(f"{OLLAMA_URL}/api/ps", timeout=10.0)
        ps_response.raise_for_status()
        loaded_models = ps_response.json().get("models", [])
        model_loaded = any(_ollama_model_matches(model) for model in loaded_models)
        if not model_loaded:
            return {
                "status": "idle",
                "unloaded": False,
                "reason": "model_not_loaded",
                "model": OLLAMA_MODEL,
            }

        active_generations = await _get_active_generations()
        if active_generations > 0:
            return {
                "status": "busy",
                "unloaded": False,
                "active_generations": active_generations,
            }

        unload_response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": "",
                "stream": False,
                "keep_alive": 0,
            },
            timeout=30.0,
        )
        unload_response.raise_for_status()
    except Exception:
        logger.warning(
            "No se pudo descargar el modelo '%s' antes del OCR.",
            OLLAMA_MODEL,
            exc_info=True,
        )
        return {"status": "error", "unloaded": False, "model": OLLAMA_MODEL}

    logger.info("Modelo '%s' descargado de Ollama por inactividad.", OLLAMA_MODEL)
    return {"status": "idle", "unloaded": True, "model": OLLAMA_MODEL}


@app.post("/generate")
async def generate_endpoint(
    payload: GenerateRequest,
    client: Annotated[httpx.AsyncClient, Depends(get_http_client)],
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

    ollama_payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_ctx": 8192},
    }
    if OLLAMA_KEEP_ALIVE:
        ollama_payload["keep_alive"] = OLLAMA_KEEP_ALIVE

    await _mark_generation_started()
    try:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json=ollama_payload,
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
    except httpx.ConnectError:
        logger.error("No se pudo conectar con Ollama en %s.", OLLAMA_URL)
        raise HTTPException(
            status_code=502,
            detail="Servicio LLM no disponible.",
        ) from None
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
    finally:
        await _mark_generation_finished()

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
