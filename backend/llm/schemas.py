"""Schemas Pydantic del servicio LLM."""

from typing import Literal

from pydantic import Field

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


class GenerateResponse(StrictModel):
    """Respuesta de ``POST /generate`` tras invocar a Ollama."""

    answer: Answer


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


class ConversationTitleResponse(StrictModel):
    """Título corto sugerido por el LLM para una conversación."""

    title: ConversationTitle
