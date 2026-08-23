"""Schemas Pydantic del servicio LLM."""

from typing import Annotated, Literal

from pydantic import Field

from common.language import Language
from common.schemas import StrictModel
from llm.annotations import (
    Answer,
    ContextChunks,
    ConversationTitle,
    ConversationTitleGameName,
    Question,
)


class ChatHistoryMessage(StrictModel):
    """Mensaje de historial recibido desde API."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1)


class GenerateRequest(StrictModel):
    """Petición de generación para Ollama."""

    question: Question
    context_chunks: ContextChunks
    chat_history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=20)
    manual_id: str | None = None
    game_name: str | None = None
    language: Language = "es"


class GenerateResponse(StrictModel):
    """Respuesta de ``POST /generate`` tras invocar a Ollama."""

    answer: Answer


class CorrectLineRequest(StrictModel):
    """Línea OCR a corregir con su ventana de contexto."""

    text: str = Field(min_length=1, max_length=1000)
    context_before: list[Annotated[str, Field(max_length=1000)]] = Field(
        default_factory=list, max_length=2
    )
    context_after: list[Annotated[str, Field(max_length=1000)]] = Field(
        default_factory=list, max_length=2
    )
    language: Language = "es"


class CorrectLineResponse(StrictModel):
    """Línea corregida por consenso de pasadas del LLM."""

    text: str = Field(min_length=1)


class CondenseQuestionRequest(StrictModel):
    """Pregunta actual e historial para recuperar contexto con más precisión."""

    question: Question
    chat_history: list[ChatHistoryMessage] = Field(min_length=1, max_length=20)


class CondenseQuestionResponse(StrictModel):
    """Pregunta independiente que RAG puede usar para buscar chunks."""

    question: Question


class ConversationTitleRequest(StrictModel):
    """Mensajes de una conversación para generar un título corto."""

    game_name: ConversationTitleGameName
    messages: list[ChatHistoryMessage] = Field(min_length=1, max_length=20)
    language: Language = "es"


class ConversationTitleResponse(StrictModel):
    """Título corto sugerido por el LLM para una conversación."""

    title: ConversationTitle
