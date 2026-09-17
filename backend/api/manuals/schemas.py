"""Schemas públicos de manuales y preguntas por juego."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StrictBool, StringConstraints, field_validator, model_validator

from api.annotations import Answer, ChunksIndexed, Question
from api.schemas import StrictModel
from database.models.constants import MANUAL_TITLE_MAX_LENGTH

GAME_QUESTION_TOP_K_MAX = 10
MANUAL_PAGE_TEXT_MAX_LENGTH = 20_000
ManualOcrStatus = Literal["pending", "processing", "completed", "failed"]
ManualDedupStatus = Literal["none", "reused"]
ManualCorrectionSource = Literal["regla-guion", "consenso-llm"]
PageText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MANUAL_PAGE_TEXT_MAX_LENGTH,
    ),
]
ManualTitle = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MANUAL_TITLE_MAX_LENGTH,
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
    anonymous: bool
    source_type: str
    page_count: int
    duplicate_page_count: int = Field(default=0, ge=0)
    language: str | None
    chunks_indexed: ChunksIndexed
    created_at: datetime
    indexed_at: datetime | None


class ManualListResponse(StrictModel):
    """Listado paginable mínimo de manuales propios."""

    manuals: list[ManualSummaryResponse]


class ManualLineCorrection(StrictModel):
    """Corrección aplicada a la línea con offsets de codepoints sobre su texto final."""

    start: int = Field(ge=0)
    end: int = Field(ge=0)
    original: str
    source: ManualCorrectionSource


class ManualTextLine(StrictModel):
    """Línea de texto guardada para una página de manual."""

    text: str
    confidence: float | None = None
    corrections: list[ManualLineCorrection] = Field(default_factory=list)


class ManualPageResponse(StrictModel):
    """Página OCR de un manual propio."""

    page_number: int
    ocr_status: ManualOcrStatus
    text_source: str
    text_quality: str | None
    dedup_status: ManualDedupStatus
    image_available: bool = False
    image_width: int | None = None
    image_height: int | None = None
    ocr_confidence_mean: float | None
    ocr_lines: list[ManualTextLine]


class ManualDetailResponse(ManualSummaryResponse):
    """Páginas del manual y permiso de gestión del usuario."""

    is_own: bool
    pages: list[ManualPageResponse]


class ManualProcessingPageResponse(StrictModel):
    """Estado ligero de una página durante el procesamiento."""

    page_number: int
    ocr_status: ManualOcrStatus
    text_quality: str | None
    dedup_status: ManualDedupStatus


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


class UpdateManualRequest(StrictModel):
    """Cambios de título o anonimato de un manual propio."""

    title: ManualTitle | None = None
    anonymous: StrictBool | None = None

    @field_validator("title", "anonymous", mode="before")
    @classmethod
    def _reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("El valor no puede ser null.")
        return value

    @model_validator(mode="after")
    def _require_a_change(self) -> "UpdateManualRequest":
        if not self.model_fields_set:
            raise ValueError("Incluye al menos un campo para actualizar.")
        return self


class GameQuestionRequest(StrictModel):
    """Pregunta dirigida al pool de manuales de un juego."""

    question: Question
    top_k: int = Field(default=3, ge=1, le=GAME_QUESTION_TOP_K_MAX)


class AnswerSource(StrictModel):
    """Fuente pública usada para construir una respuesta RAG."""

    manual_id: UUID
    manual_title: str | None
    page: int = Field(ge=1)
    is_own: bool = False
    author_name: str | None = None


class AnswerResponse(StrictModel):
    """Respuesta generada a partir de chunks autorizados."""

    answer: Answer
    sources: list[AnswerSource] = Field(default_factory=list)
