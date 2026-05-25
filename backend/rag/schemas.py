"""Schemas Pydantic del servicio RAG."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, model_validator

from rag.annotations import (
    ChunksIndexed,
    ManualId,
    NonEmptyText,
    Question,
    SourcePage,
    TopK,
)


class OCRLine(BaseModel):
    """Línea OCR ingerida por el servicio RAG (acepta confianza ausente)."""

    model_config = ConfigDict(extra="forbid")

    text: NonEmptyText
    confidence: float | None = None


class IngestRequest(BaseModel):
    """Petición de ingesta: texto plano u OCR estructurado."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    text: str | None = None
    source_page: SourcePage | None = 1
    ocr_lines: list[OCRLine] | None = None

    @model_validator(mode="after")
    def validate_content(self) -> IngestRequest:
        if not self.text and not self.ocr_lines:
            raise ValueError("Se requiere 'text' o 'ocr_lines'.")
        return self


class RetrieveRequest(BaseModel):
    """Petición de recuperación de contexto para una pregunta."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    question: Question
    top_k: TopK = 3


class IngestResponse(BaseModel):
    """Respuesta de ``POST /ingest`` tras persistir el manual."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    chunks_indexed: ChunksIndexed
    status: str


class RetrievedChunk(BaseModel):
    """Fragmento recuperado de ChromaDB con su metadata útil."""

    model_config = ConfigDict(extra="forbid")

    id: str
    text: str
    chunk_index: int
    source_page: int
    score: float


class RetrieveResponse(BaseModel):
    """Respuesta de ``POST /retrieve`` con los fragmentos más relevantes."""

    model_config = ConfigDict(extra="forbid")

    chunks: list[RetrievedChunk]
