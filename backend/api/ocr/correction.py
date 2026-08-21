"""Corrección de líneas OCR con reglas deterministas y consenso LLM."""

import logging

import httpx

from api import client as internal_client
from api import config
from api.exceptions import ApiError
from common.language import Language, detect_language
from common.ocr.correction_rules import (
    OcrCorrectionConfig,
    apply_correction_rules,
    needs_llm_correction,
    page_vocabulary,
)
from common.ocr.lexicon import spanish_lexicon

logger = logging.getLogger(__name__)

_CONTEXT_WINDOW_LINES = 2


async def correct_ocr_lines(
    lines: list[dict[str, object]],
    *,
    client: httpx.AsyncClient,
) -> list[dict[str, object]]:
    """Aplica el filtro y las reglas a la página y corrige la franja media con el LLM."""
    correction_config = _correction_config()
    vocabulary = spanish_lexicon() | page_vocabulary(lines)
    processed = apply_correction_rules(lines, config=correction_config, vocabulary=vocabulary)

    if not config.OLLAMA_CORRECTION_MODEL:
        return processed

    language = _page_language(processed)
    llm_enabled = True
    corrected: list[dict[str, object]] = []
    llm_failures = 0
    for index, line in enumerate(processed):
        if llm_enabled and needs_llm_correction(line, config=correction_config):
            corrected_text = await _request_correction(
                client=client,
                lines=processed,
                index=index,
                language=language,
            )
            if corrected_text is None:
                llm_enabled = False
                llm_failures += 1
            else:
                line = dict(line)
                line["text"] = corrected_text
        corrected.append(line)

    logger.info(
        "Correccion OCR: %d lineas de entrada, %d supervivientes, %d fallos LLM.",
        len(lines),
        len(corrected),
        llm_failures,
    )
    return corrected


def _correction_config() -> OcrCorrectionConfig:
    return OcrCorrectionConfig(
        discard_below=config.OCR_CORRECTION_DISCARD_BELOW,
        llm_below=config.OCR_CORRECTION_LLM_BELOW,
    )


def _page_language(lines: list[dict[str, object]]) -> Language:
    """Detecta el idioma dominante de la página y usa el español como respaldo."""
    page_text = " ".join(text for line in lines if isinstance(text := line.get("text"), str))
    return detect_language(text=page_text) or "es"


def _context_window(
    lines: list[dict[str, object]],
    index: int,
) -> tuple[list[str], list[str]]:
    """Construye la ventana de líneas vecinas a partir de la lista final."""
    before = [
        text
        for neighbor in lines[max(0, index - _CONTEXT_WINDOW_LINES) : index]
        if isinstance(text := neighbor.get("text"), str)
    ]
    after = [
        text
        for neighbor in lines[index + 1 : index + 1 + _CONTEXT_WINDOW_LINES]
        if isinstance(text := neighbor.get("text"), str)
    ]
    return before, after


async def _request_correction(
    *,
    client: httpx.AsyncClient,
    lines: list[dict[str, object]],
    index: int,
    language: Language,
) -> str | None:
    """Solicita la corrección de una línea y devuelve None ante cualquier fallo."""
    text = lines[index].get("text")
    if not isinstance(text, str):
        return None
    before, after = _context_window(lines, index)
    try:
        body = await internal_client.post_json(
            client=client,
            service_name="LLM",
            url=f"{config.LLM_URL}/correct-line",
            payload={
                "text": text,
                "context_before": before,
                "context_after": after,
                "language": language,
            },
            unavailable_detail="Servicio LLM no disponible.",
            internal_detail="Error interno al corregir la linea OCR.",
        )
    except ApiError:
        logger.warning(
            "Fallo del corrector LLM en una linea, se desactiva para el resto de la pagina.",
            exc_info=True,
        )
        return None

    corrected = body.get("text")
    if not isinstance(corrected, str) or not corrected.strip():
        logger.warning("Respuesta del corrector LLM sin texto valido, linea conservada.")
        return None
    return corrected
