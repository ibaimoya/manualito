import logging
import time

import httpx

from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from llm import config
from llm.client import JsonValue, OllamaClient, OllamaResponseError, model_control_payload
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
    CondenseQuestionResponse,
    ConversationTitleRequest,
    ConversationTitleResponse,
    GenerateRequest,
    GenerateResponse,
)

logger = logging.getLogger(__name__)


async def generate_answer(
    *,
    payload: GenerateRequest,
    client: httpx.AsyncClient,
) -> GenerateResponse:
    """
    Genera una respuesta usando Ollama a partir de una pregunta y su contexto.

    Args:
        payload (GenerateRequest): Pregunta del usuario y chunks relevantes.
        client (httpx.AsyncClient): Cliente HTTP compartido inyectado por FastAPI.

    Returns:
        GenerateResponse: Respuesta final limpia generada por el LLM.
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
    return GenerateResponse(answer=answer)


async def condense_question(
    *,
    payload: CondenseQuestionRequest,
    client: httpx.AsyncClient,
) -> CondenseQuestionResponse:
    """
    Reformula una pregunta contextual para mejorar la recuperación RAG.

    Args:
        payload (CondenseQuestionRequest): Pregunta actual e historial reciente.
        client (httpx.AsyncClient): Cliente HTTP compartido.

    Returns:
        CondenseQuestionResponse: Pregunta independiente para usar en recuperación.
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
    return CondenseQuestionResponse(question=question)


async def generate_conversation_title(
    *,
    payload: ConversationTitleRequest,
    client: httpx.AsyncClient,
) -> ConversationTitleResponse:
    """
    Genera un título corto para una conversación.

    Args:
        payload (ConversationTitleRequest): Mensajes recientes del chat.
        client (httpx.AsyncClient): Cliente HTTP compartido.

    Returns:
        ConversationTitleResponse: Título limpio y acotado.
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
    return ConversationTitleResponse(title=title)


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

    ollama_payload: dict[str, JsonValue] = {
        **model_control_payload(),
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": config.OLLAMA_TEMPERATURE,
            "num_ctx": config.OLLAMA_NUM_CTX,
        },
    }

    ollama = OllamaClient(client)

    try:
        generated_text = await ollama.generate(ollama_payload)
    except httpx.ConnectError:
        logger.error("No se pudo conectar con Ollama en %s.", config.OLLAMA_URL)
        raise LlmUnavailableError from None
    except (TimeoutError, httpx.TimeoutException):
        logger.error("Ollama no respondió en %ss.", config.OLLAMA_TIMEOUT)
        raise LlmTimeoutError from None
    except httpx.HTTPStatusError as llm_err:
        logger.exception("Ollama devolvió un error HTTP.")
        raise LlmGenerationError from llm_err
    except OllamaResponseError:
        logger.exception("Respuesta JSON inválida de Ollama.")
        raise InvalidLlmResponseError from None

    answer = generated_text.strip()
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
