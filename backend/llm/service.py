import logging
import time

import httpx

from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from common.language import Language
from llm import config
from llm.client import (
    JsonValue,
    OllamaClient,
    OllamaResponseError,
    model_control_payload,
    model_options,
)
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
    output_language_instruction,
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

_ANSWER_RETRY_INSTRUCTIONS: dict[Language, str] = {
    "es": (
        "INSTRUCCIÓN ADICIONAL\n"
        "La respuesta anterior habría superado {max_chars} caracteres. Genera una "
        "versión más breve que quepa en ese límite. Prioriza la respuesta directa y "
        "las reglas imprescindibles. No indiques que estás resumiendo."
    ),
    "en": (
        "ADDITIONAL INSTRUCTION\n"
        "The previous answer would have exceeded {max_chars} characters. Generate a "
        "shorter version within that limit. Prioritize the direct answer and essential "
        "rules. Do not mention that you are summarizing."
    ),
}


async def generate_answer(
    *,
    payload: GenerateRequest,
    client: httpx.AsyncClient,
) -> GenerateResponse:
    """Genera una respuesta con Ollama a partir de la pregunta y su contexto."""
    prompt, included_chunks = build_prompt(
        question=payload.question,
        context_chunks=payload.context_chunks,
        chat_history=[message.model_dump() for message in payload.chat_history],
        game_name=payload.game_name,
        language=payload.language,
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
        language=payload.language,
    )
    return GenerateResponse(answer=answer)


async def condense_question(
    *,
    payload: CondenseQuestionRequest,
    client: httpx.AsyncClient,
) -> CondenseQuestionResponse:
    """Reformula una pregunta contextual para mejorar la recuperación RAG."""
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
    """Genera un título corto para una conversación."""
    prompt = build_title_prompt(
        game_name=payload.game_name,
        messages=[message.model_dump() for message in payload.messages],
        language=payload.language,
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
        "options": model_options(),
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
    language: Language,
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
        prompt=f"{prompt}{_answer_retry_prompt_suffix(language=language)}",
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


def _answer_retry_prompt_suffix(*, language: Language) -> str:
    """Construye la instrucción breve con el límite actual de respuesta."""
    retry_instruction = _ANSWER_RETRY_INSTRUCTIONS[language].format(
        max_chars=MESSAGE_CONTENT_MAX_LENGTH
    )
    language_instruction = output_language_instruction(language=language)
    return f"\n\n{retry_instruction}\n\n{language_instruction}"


def _clean_title(title: str) -> str:
    """Normaliza el título devuelto por Ollama antes de validarlo."""
    lines = title.strip().strip("\"'`").splitlines()
    if not lines:
        return ""
    cleaned = lines[0].strip().rstrip(".")
    if len(cleaned) <= MAX_TITLE_CHARS:
        return cleaned
    return f"{cleaned[: MAX_TITLE_CHARS - 3].rstrip()}..."
