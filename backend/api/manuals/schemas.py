"""Schemas públicos de manuales y preguntas por juego."""

from datetime import datetime
from uuid import UUID

from pydantic import Field

from api.annotations import Answer, ChunksIndexed, Question
from api.ocr.schemas import OcrLine
from api.schemas import StrictModel

GAME_QUESTION_TOP_K_MAX = 10


class ManualCreatedResponse(StrictModel):
    """Respuesta tras persistir un manual e intentar indexarlo."""

    manual_id: UUID
    game_id: UUID
    status: str
    visibility: str
    chunks_indexed: ChunksIndexed
    ocr_lines: list[OcrLine]


class ManualSummaryResponse(StrictModel):
    """Resumen de un manual del usuario autenticado."""

    id: UUID
    game_id: UUID
    game_name: str
    title: str | None
    status: str
    visibility: str
    language: str | None
    chunks_indexed: ChunksIndexed
    created_at: datetime
    indexed_at: datetime | None


class ManualListResponse(StrictModel):
    """Listado paginable mínimo de manuales propios."""

    manuals: list[ManualSummaryResponse]


class ManualPageResponse(StrictModel):
    """Página OCR de un manual propio."""

    page_number: int
    ocr_status: str
    ocr_lines: list[OcrLine]


class ManualDetailResponse(ManualSummaryResponse):
    """Detalle de un manual propio con páginas OCR."""

    pages: list[ManualPageResponse]


class GameQuestionRequest(StrictModel):
    """Pregunta dirigida al pool de manuales de un juego."""

    question: Question
    top_k: int = Field(default=3, ge=1, le=GAME_QUESTION_TOP_K_MAX)


class AnswerResponse(StrictModel):
    """Respuesta generada a partir de chunks autorizados."""

    answer: Answer
