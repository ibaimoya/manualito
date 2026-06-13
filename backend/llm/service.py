import asyncio
import logging
import time

import httpx

from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from llm import config
from llm.client import OllamaClient, ollama_model_matches
from llm.exceptions import (
    EmptyLlmAnswerError,
    InvalidLlmResponseError,
    LlmGenerationError,
    LlmTimeoutError,
    LlmUnavailableError,
)
from llm.prompt_builder import (
    MAX_TITLE_CHARS,
    build_condense_question_prompt,
    build_prompt,
    build_title_prompt,
)
from llm.schemas import (
    CondenseQuestionRequest,
    ConversationTitleRequest,
    GenerateRequest,
)

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
    prompt, included_chunks = build_prompt(
        payload.question,
        payload.context_chunks,
        [message.model_dump() for message in payload.chat_history],
    )
    total_chunks = len(payload.context_chunks)
    if included_chunks < total_chunks:
        logger.warning(
            "Prompt recortado por presupuesto: %d/%d chunks incluidos.",
            included_chunks,
            total_chunks,
        )

    answer = await _generate_answer_with_retry(
        prompt=prompt,
        client=client,
    )
    return {"answer": answer}


async def condense_question(
    *,
    payload: CondenseQuestionRequest,
    client: httpx.AsyncClient,
) -> dict:
    """
    Reformula una pregunta contextual para mejorar la recuperación RAG.

    Args:
        payload (CondenseQuestionRequest): Pregunta actual e historial reciente.
        client (httpx.AsyncClient): Cliente HTTP compartido.

    Returns:
        dict: Pregunta independiente para usar en recuperación.
    """
    prompt = build_condense_question_prompt(
        payload.question,
        [message.model_dump() for message in payload.chat_history],
    )
    question = await _generate_text(
        prompt=prompt,
        client=client,
        log_label="pregunta reformulada",
    )
    return {"question": question}


async def generate_conversation_title(
    *,
    payload: ConversationTitleRequest,
    client: httpx.AsyncClient,
) -> dict:
    """
    Genera un título corto para una conversación.

    Args:
        payload (ConversationTitleRequest): Mensajes recientes del chat.
        client (httpx.AsyncClient): Cliente HTTP compartido.

    Returns:
        dict: Título limpio y acotado.
    """
    prompt = build_title_prompt(
        payload.game_name,
        [message.model_dump() for message in payload.messages],
    )
    title = _clean_title(
        await _generate_text(
            prompt=prompt,
            client=client,
            log_label="título de conversación",
        )
    )
    if not title:
        raise EmptyLlmAnswerError
    return {"title": title}


async def _generate_text(
    *,
    prompt: str,
    client: httpx.AsyncClient,
    log_label: str,
) -> str:
    """Invoca Ollama y devuelve texto limpio para un prompt ya construido."""
    start = time.perf_counter()
    logger.info(
        "Generando %s: modelo=%s, prompt_chars=%d.",
        log_label,
        config.OLLAMA_MODEL,
        len(prompt),
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
        "Texto generado en %.2fs (chars=%d, tipo=%s).",
        elapsed,
        len(answer),
        log_label,
    )
    return answer


async def _generate_answer_with_retry(
    *,
    prompt: str,
    client: httpx.AsyncClient,
) -> str:
    """Reintenta una vez si la respuesta no cabe en el contrato público."""
    answer = await _generate_text(
        prompt=prompt,
        client=client,
        log_label="respuesta",
    )
    if len(answer) <= MESSAGE_CONTENT_MAX_LENGTH:
        return answer

    logger.warning(
        "Respuesta LLM demasiado larga (%d/%d chars); reintentando en modo breve.",
        len(answer),
        MESSAGE_CONTENT_MAX_LENGTH,
    )
    shorter_answer = await _generate_text(
        prompt=f"{prompt}{_answer_retry_prompt_suffix()}",
        client=client,
        log_label="respuesta breve",
    )
    if len(shorter_answer) > MESSAGE_CONTENT_MAX_LENGTH:
        logger.error(
            "Respuesta LLM sigue siendo demasiado larga tras reintento (%d/%d chars).",
            len(shorter_answer),
            MESSAGE_CONTENT_MAX_LENGTH,
        )
        raise InvalidLlmResponseError
    return shorter_answer


def _answer_retry_prompt_suffix() -> str:
    """Construye la instrucción breve con el límite actual de respuesta."""
    return (
        "\n\nINSTRUCCIÓN ADICIONAL:\n"
        f"La respuesta anterior habría superado {MESSAGE_CONTENT_MAX_LENGTH} caracteres. "
        "Genera una versión más breve que quepa en ese límite. Prioriza la respuesta "
        "directa y las reglas imprescindibles. No indiques que estás resumiendo."
    )


def _clean_title(title: str) -> str:
    """Normaliza el título devuelto por Ollama antes de validarlo."""
    lines = title.strip().strip("\"'`").splitlines()
    if not lines:
        return ""
    cleaned = lines[0].strip().rstrip(".")
    if len(cleaned) <= MAX_TITLE_CHARS:
        return cleaned
    return f"{cleaned[: MAX_TITLE_CHARS - 3].rstrip()}..."
