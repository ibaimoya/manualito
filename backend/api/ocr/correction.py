"""Corrección de líneas OCR con reglas deterministas y consenso LLM."""

import logging
from typing import cast

import httpx

from api import client as internal_client
from api import config
from api.exceptions import ApiError
from common.language import Language, detect_language
from common.ocr.annotations import correction_annotations
from common.ocr.correction_rules import (
    OcrCorrectionConfig,
    RuleCorrectionResult,
    apply_correction_rules,
    needs_llm_correction,
    page_vocabulary,
)
from common.ocr.lexicon import spanish_lexicon

logger = logging.getLogger(__name__)

_CONTEXT_WINDOW_LINES = 2
_HYPHEN_SOURCE = "regla-guion"
_LLM_SOURCE = "consenso-llm"


async def correct_ocr_lines(
    lines: list[dict[str, object]],
    *,
    client: httpx.AsyncClient,
) -> list[dict[str, object]]:
    """Aplica las reglas a la página, corrige la franja media y anota la procedencia."""
    correction_config = _correction_config()
    vocabulary = spanish_lexicon() | page_vocabulary(lines)
    rules = apply_correction_rules(lines, config=correction_config, vocabulary=vocabulary)
    corrected, llm_failures = await _correct_band_with_llm(
        rules.lines,
        correction_config=correction_config,
        client=client,
    )
    logger.info(
        "Correccion OCR: %d lineas de entrada, %d supervivientes, %d fallos LLM.",
        len(lines),
        len(corrected),
        llm_failures,
    )
    return _annotate_lines(corrected, rules=rules)


async def _correct_band_with_llm(
    lines: list[dict[str, object]],
    *,
    correction_config: OcrCorrectionConfig,
    client: httpx.AsyncClient,
) -> tuple[list[dict[str, object]], int]:
    """Corrige la franja media con el LLM y se desactiva al primer fallo de la página."""
    if not config.OLLAMA_CORRECTION_MODEL:
        return lines, 0
    language = _page_language(lines)
    llm_enabled = True
    corrected: list[dict[str, object]] = []
    llm_failures = 0
    for index, line in enumerate(lines):
        if llm_enabled and needs_llm_correction(line, config=correction_config):
            corrected_text = await _request_correction(
                client=client,
                lines=lines,
                index=index,
                language=language,
            )
            if corrected_text is None:
                llm_enabled = False
                llm_failures += 1
            else:
                line = {**line, "text": corrected_text}
        corrected.append(line)
    return corrected, llm_failures


def _annotate_lines(
    lines: list[dict[str, object]],
    *,
    rules: RuleCorrectionResult,
) -> list[dict[str, object]]:
    """Adjunta a cada línea las anotaciones derivadas frente a su base."""
    annotated: list[dict[str, object]] = []
    for line, base, joins in zip(lines, rules.bases, rules.hyphen_joins, strict=True):
        text = cast(str, line.get("text"))
        if annotations := correction_annotations(base=base, corrected=text):
            corrections = [_with_source(annotation, joins=joins) for annotation in annotations]
            line = {**line, "corrections": corrections}
        annotated.append(line)
    return annotated


def _with_source(annotation: dict[str, object], *, joins: frozenset[str]) -> dict[str, object]:
    """Etiqueta la anotación según su original coincida o no con una unión de guiones."""
    source = _HYPHEN_SOURCE if annotation["original"] in joins else _LLM_SOURCE
    return {**annotation, "source": source}


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
