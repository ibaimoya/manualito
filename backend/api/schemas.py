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
    """Respuesta de ``POST /api/manuals`` tras indexar el manual en RAG.

    El campo ``ocr_lines`` expone al cliente el mismo texto OCR que el
    gateway ya extrajo internamente para indexar el manual en RAG.
    Permite que el frontend muestre la fuente original sin tener que
    llamar de nuevo a ``POST /api/ocr`` (evita un segundo OCR del mismo
    fichero, costoso en CPU).
    """

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualSlug
    chunks_indexed: ChunksIndexed
    status: str
    ocr_lines: list[OcrLine]


class AnswerResponse(BaseModel):
    """Respuesta de ``POST /api/manuals/{manual_id}/questions``."""

    model_config = ConfigDict(extra="forbid")

    answer: Answer
