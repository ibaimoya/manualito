"""Schemas Pydantic del servicio LLM."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from llm.annotations import Answer, ContextChunks, Question


class GenerateRequest(BaseModel):
    """Petición de generación para Ollama."""

    model_config = ConfigDict(extra="forbid")

    question: Question
    context_chunks: ContextChunks
    manual_id: str | None = None


class GenerateResponse(BaseModel):
    """Respuesta de ``POST /generate`` tras invocar a Ollama."""

    model_config = ConfigDict(extra="forbid")

    answer: Answer


class UnloadIfIdleResponse(BaseModel):
    """
    Respuesta del endpoint ``/unload-if-idle``.

    Su forma varía según el estado de Ollama (``busy``, ``idle``, ``error``)
    y por eso los campos contextuales son opcionales. El endpoint usa
    ``response_model_exclude_none=True`` para omitir los nulos en la
    serialización JSON y preservar el shape exacto que esperan los tests.
    """

    model_config = ConfigDict(extra="forbid")

    status: Literal["busy", "idle", "error"]
    unloaded: bool
    active_generations: int | None = None
    reason: Literal["model_not_loaded"] | None = None
    model: str | None = None
