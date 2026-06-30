"""DTOs internos de manuales."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ValidatedManualImage:
    """Imagen validada y lista para almacenaje/OCR."""

    content: bytes
    mime_type: str
    extension: str
    width: int
    height: int
    sha256: str


@dataclass(frozen=True, slots=True)
class ValidatedManualPdf:
    """PDF validado y listo para almacenaje/procesamiento posterior."""

    content: bytes
    mime_type: str
    extension: str
    page_count: int
    sha256: str


@dataclass(frozen=True, slots=True)
class PreparedChunk:
    """Chunk generado antes de persistir e indexar."""

    text: str
    chunk_index: int
    source_page: int
    content_hash: str


@dataclass(frozen=True, slots=True)
class StoredManualImage:
    """Imagen validada y ya guardada."""

    page_number: int
    image: ValidatedManualImage
    storage_key: str


@dataclass(frozen=True, slots=True)
class StoredManualPdf:
    """PDF validado y ya guardado en el almacenamiento."""

    pdf: ValidatedManualPdf
    storage_key: str


@dataclass(frozen=True, slots=True)
class AuthorizedChunk:
    """Chunk autorizado para construir contexto del LLM."""

    id: UUID
    text: str
    content_hash: str
    manual_id: UUID
    manual_title: str | None
    source_page: int
    is_own: bool


@dataclass(frozen=True, slots=True)
class ReusablePageResult:
    """Texto y chunks de una página canónica reutilizable."""

    page_id: UUID
    ocr_lines: list[dict[str, object]]
    text_source: str
    text_quality: str | None
    ocr_confidence_mean: float | None
    chunk_texts: list[str]


@dataclass(frozen=True, slots=True)
class ManualSummary:
    """Resumen de manual propio leído desde Postgres."""

    id: UUID
    game_id: UUID
    game_name: str
    title: str | None
    status: str
    visibility: str
    source_type: str
    page_count: int
    language: str | None
    chunks_indexed: int
    created_at: datetime
    indexed_at: datetime | None
    duplicate_page_count: int


@dataclass(frozen=True, slots=True)
class ManualPageDetail:
    """Página de manual propia lista para respuesta pública."""

    page_number: int
    ocr_status: str
    text_source: str
    text_quality: str | None
    ocr_confidence_mean: float | None
    ocr_lines: list[dict[str, object]]
    image_available: bool
    image_width: int | None
    image_height: int | None
    dedup_status: str


@dataclass(frozen=True, slots=True)
class ManualDetail(ManualSummary):
    """Detalle completo de manual propio."""

    pages: list[ManualPageDetail]


@dataclass(frozen=True, slots=True)
class ManualProcessingPage:
    """Estado ligero de una página durante el procesamiento."""

    page_number: int
    ocr_status: str
    text_quality: str | None
    dedup_status: str


@dataclass(frozen=True, slots=True)
class ManualProcessingStatus:
    """Progreso de procesamiento de un manual propio."""

    manual_id: UUID
    status: str
    page_count: int
    pages: list[ManualProcessingPage]


@dataclass(frozen=True, slots=True)
class ManualPageForProcessing:
    """Página reclamada por el procesador con asset opcional."""

    id: UUID
    page_number: int
    storage_key: str | None
    mime_type: str | None
    width: int | None
    height: int | None
    sha256: str | None


@dataclass(frozen=True, slots=True)
class ManualPageEditContext:
    """Datos mínimos para editar una página de manual propio."""

    status: str
    visibility: str
    page_id: UUID


@dataclass(frozen=True, slots=True)
class ManualPageImageAsset:
    """Asset de imagen autorizado para visualizar una página."""

    storage_key: str
    mime_type: str
    byte_size: int
    sha256: str
    width: int | None
    height: int | None


@dataclass(frozen=True, slots=True)
class DeletedManualAssets:
    """Datos necesarios para limpiar almacenamiento y Chroma tras el commit."""

    manual_id: UUID
    chunk_ids: list[UUID]
    storage_keys: list[str]


@dataclass(frozen=True, slots=True)
class PageEditResult:
    """Resultado de editar una página y trabajo RAG derivado."""

    page_detail: ManualPageDetail
    page_id: UUID
    stale_chunk_ids: list[UUID]
