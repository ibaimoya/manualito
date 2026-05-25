"""Schemas Pydantic del gateway."""

from pydantic import BaseModel, ConfigDict

from api.annotations import Answer, ChunksIndexed, ManualSlug, Question


class QuestionRequest(BaseModel):
    """Pregunta dirigida a un manual indexado."""

    model_config = ConfigDict(extra="forbid")

    question: Question


class OcrLine(BaseModel):
    """Línea OCR tal como la consume el gateway desde el servicio OCR."""

    model_config = ConfigDict(extra="forbid")

    text: str
    confidence: float


class OcrLinesResponse(BaseModel):
    """Respuesta JSON de ``POST /api/ocr``."""

    model_config = ConfigDict(extra="forbid")

    lines: list[OcrLine]


class ManualCreatedResponse(BaseModel):
    """Respuesta de ``POST /api/manuals`` tras indexar el manual en RAG."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualSlug
    chunks_indexed: ChunksIndexed
    status: str


class AnswerResponse(BaseModel):
    """Respuesta de ``POST /api/manuals/{manual_id}/questions``."""

    model_config = ConfigDict(extra="forbid")

    answer: Answer
