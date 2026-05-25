import asyncio
import logging
import time

import httpx

from llm import config
from llm.client import OllamaClient, ollama_model_matches
from llm.exceptions import (
    EmptyLlmAnswerError,
    InvalidLlmResponseError,
    LlmGenerationError,
    LlmTimeoutError,
    LlmUnavailableError,
)
from llm.prompt_builder import build_prompt
from llm.schemas import GenerateRequest

logger = logging.getLogger(__name__)

_active_generations = 0
_active_generations_lock = asyncio.Lock()


async def mark_generation_started() -> None:
    """Registra el inicio de una generación para evitar descargas concurrentes."""
    global _active_generations
    async with _active_generations_lock:
        _active_generations += 1


async def mark_generation_finished() -> None:
    """Registra el fin de una generación LLM en curso."""
    global _active_generations
    async with _active_generations_lock:
        _active_generations = max(0, _active_generations - 1)


async def get_active_generations() -> int:
    """Devuelve el número de generaciones activas sin retener el lock."""
    async with _active_generations_lock:
        return _active_generations


async def unload_if_idle(client: httpx.AsyncClient) -> dict:
    """
    Descarga el modelo de Ollama si no hay generación activa.

    Lo usa el gateway antes de un OCR potencialmente pesado para liberar VRAM
    a PaddleOCR GPU. Es deliberadamente best-effort: si Ollama no responde, no
    debe romper el flujo de OCR.
    """
    active_generations = await get_active_generations()
    if active_generations > 0:
        return {
            "status": "busy",
            "unloaded": False,
            "active_generations": active_generations,
        }

    ollama = OllamaClient(client)
    try:
        loaded_models = (await ollama.get_ps()).get("models", [])
        model_loaded = any(ollama_model_matches(model) for model in loaded_models)
        if not model_loaded:
            return {
                "status": "idle",
                "unloaded": False,
                "reason": "model_not_loaded",
                "model": config.OLLAMA_MODEL,
            }

        # Durante /api/ps puede haber empezado una generación nueva.
        active_generations = await get_active_generations()
        if active_generations > 0:
            return {
                "status": "busy",
                "unloaded": False,
                "active_generations": active_generations,
            }

        await ollama.unload_model()
    except (httpx.HTTPError, ValueError):
        logger.warning(
            "No se pudo descargar el modelo '%s' antes del OCR.",
            config.OLLAMA_MODEL,
            exc_info=True,
        )
        return {"status": "error", "unloaded": False, "model": config.OLLAMA_MODEL}

    logger.info("Modelo '%s' descargado de Ollama por inactividad.", config.OLLAMA_MODEL)
    return {"status": "idle", "unloaded": True, "model": config.OLLAMA_MODEL}


async def generate_answer(
    *,
    payload: GenerateRequest,
    client: httpx.AsyncClient,
) -> dict:
    """
    Genera una respuesta usando Ollama a partir de una pregunta y su contexto.

    Args:
        payload (GenerateRequest): Pregunta del usuario y chunks relevantes.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        dict: Respuesta final limpia generada por el LLM.
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
        config.OLLAMA_MODEL,
        len(prompt),
        included_chunks,
    )

    ollama_payload = {
        "model": config.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": config.OLLAMA_TEMPERATURE,
            "num_ctx": config.OLLAMA_NUM_CTX,
        },
    }
    if config.OLLAMA_KEEP_ALIVE:
        ollama_payload["keep_alive"] = config.OLLAMA_KEEP_ALIVE

    ollama = OllamaClient(client)

    await mark_generation_started()
    try:
        response = await ollama.generate(ollama_payload)
    except httpx.ConnectError:
        logger.error("No se pudo conectar con Ollama en %s.", config.OLLAMA_URL)
        raise LlmUnavailableError from None
    except httpx.TimeoutException:
        logger.error("Ollama no respondió en %ss.", config.OLLAMA_TIMEOUT)
        raise LlmTimeoutError from None
    except httpx.HTTPStatusError as llm_err:
        logger.exception("Ollama devolvió un error HTTP.")
        raise LlmGenerationError from llm_err
    finally:
        await mark_generation_finished()

    try:
        body = response.json()
    except ValueError:
        logger.exception("Respuesta JSON inválida de Ollama.")
        raise InvalidLlmResponseError from None

    answer = (body.get("response") or "").strip()
    if not answer:
        raise EmptyLlmAnswerError

    elapsed = time.perf_counter() - start
    logger.info(
        "Respuesta generada en %.2fs (answer_chars=%d).",
        elapsed,
        len(answer),
    )
    return {"answer": answer}
