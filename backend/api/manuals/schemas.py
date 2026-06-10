"""Schemas públicos de manuales y preguntas por juego."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from api.annotations import Answer, ChunksIndexed, Question
from api.schemas import StrictModel

GAME_QUESTION_TOP_K_MAX = 10
MANUAL_PAGE_TEXT_MAX_LENGTH = 20_000
PageText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MANUAL_PAGE_TEXT_MAX_LENGTH,
    ),
]


class ManualCreatedResponse(StrictModel):
    """Respuesta tras aceptar un manual para procesamiento."""

    manual_id: UUID
    game_id: UUID
    status: str
    visibility: str
    source_type: str
    page_count: int


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


class ManualTextLine(StrictModel):
    """Línea de texto guardada para una página de manual."""

    text: str
    confidence: float | None = None


class ManualPageResponse(StrictModel):
    """Página OCR de un manual propio."""

    page_number: int
    ocr_status: str
    text_source: str
    text_quality: str | None
    ocr_confidence_mean: float | None
    ocr_lines: list[ManualTextLine]


class ManualDetailResponse(ManualSummaryResponse):
    """Detalle de un manual propio con páginas OCR."""

    pages: list[ManualPageResponse]


class ManualProcessingPageResponse(StrictModel):
    """Estado ligero de una página durante el procesamiento."""

    page_number: int
    ocr_status: str
    text_quality: str | None


class ManualProcessingResponse(StrictModel):
    """Progreso multipágina de un manual propio."""

    manual_id: UUID
    status: str
    page_count: int
    completed_pages: int
    failed_pages: int
    pages: list[ManualProcessingPageResponse]


class EditPageTextRequest(StrictModel):
    """Texto corregido a mano para una página de manual propio."""

    text: PageText


class GameQuestionRequest(StrictModel):
    """Pregunta dirigida al pool de manuales de un juego."""

    question: Question
    top_k: int = Field(default=3, ge=1, le=GAME_QUESTION_TOP_K_MAX)


class AnswerSource(StrictModel):
    """Fuente pública usada para construir una respuesta RAG."""

    manual_id: UUID
    manual_title: str | None
    page: int = Field(ge=1)


class AnswerResponse(StrictModel):
    """Respuesta generada a partir de chunks autorizados."""

    answer: Answer
    sources: list[AnswerSource] = Field(default_factory=list)
