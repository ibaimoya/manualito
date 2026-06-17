"""Modelos de manuales, páginas OCR y chunks indexables."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import (
    EMBEDDING_MODEL_MAX_LENGTH,
    MANUAL_LANGUAGE_MAX_LENGTH,
    MANUAL_TITLE_MAX_LENGTH,
    ON_DELETE_SET_NULL,
    SHA256_HEX_LENGTH,
)


class Manual(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Manual subido por un usuario y asociado a un juego."""

    __tablename__ = "manuals"

    owner_user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("games.id"),
        nullable=False,
    )
    source_asset_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete=ON_DELETE_SET_NULL),
    )
    title: Mapped[str | None] = mapped_column(String(MANUAL_TITLE_MAX_LENGTH))
    source_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'images'"),
    )
    page_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("1"),
    )
    status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        server_default=text("'indexing'"),
    )
    language: Mapped[str | None] = mapped_column(String(MANUAL_LANGUAGE_MAX_LENGTH))
    visibility: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'private'"),
    )
    chunks_indexed: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "title IS NULL OR (length(btrim(title)) > 0 AND title = btrim(title))",
            name="title_valid",
        ),
        CheckConstraint("source_type IN ('images', 'pdf')", name="source_type_valid"),
        CheckConstraint("page_count > 0", name="page_count_positive"),
        CheckConstraint(
            "status IN ('indexing', 'active', 'pending_review', 'hidden', 'failed')",
            name="status_valid",
        ),
        CheckConstraint(
            "language IS NULL OR length(btrim(language)) > 0",
            name="language_not_empty",
        ),
        CheckConstraint("visibility IN ('shared', 'private')", name="visibility_valid"),
        CheckConstraint("chunks_indexed >= 0", name="chunks_indexed_non_negative"),
        Index("ix_manuals_owner_user_id", owner_user_id),
        Index("ix_manuals_game_id", game_id),
        Index("ix_manuals_source_asset_id", source_asset_id),
        Index(
            "ix_manuals_game_shared_active",
            game_id,
            postgresql_where=text(
                "visibility = 'shared' AND status = 'active' AND deleted_at IS NULL"
            ),
        ),
    )


class ManualPage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Página de manual con líneas OCR persistidas en JSONB."""

    __tablename__ = "manual_pages"

    manual_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("manuals.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_number: Mapped[int] = mapped_column(Integer, nullable=False)
    image_asset_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete=ON_DELETE_SET_NULL),
    )
    source_fingerprint: Mapped[str | None] = mapped_column(String(SHA256_HEX_LENGTH))
    source_fingerprint_kind: Mapped[str | None] = mapped_column(String(32))
    source_reused_from_page_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("manual_pages.id", ondelete=ON_DELETE_SET_NULL),
    )
    ocr_lines: Mapped[list[dict[str, object]]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    ocr_status: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        server_default=text("'pending'"),
    )
    text_source: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'none'"),
    )
    text_quality: Mapped[str | None] = mapped_column(String(24))
    ocr_confidence_mean: Mapped[float | None] = mapped_column(Float)
    ocr_engine: Mapped[str | None] = mapped_column(String(80))
    ocr_version: Mapped[str | None] = mapped_column(String(80))

    __table_args__ = (
        CheckConstraint("page_number > 0", name="page_number_positive"),
        CheckConstraint(
            f"source_fingerprint IS NULL OR length(source_fingerprint) = {SHA256_HEX_LENGTH}",
            name="source_fingerprint_length_valid",
        ),
        CheckConstraint(
            "(source_fingerprint IS NULL AND source_fingerprint_kind IS NULL) OR "
            "(source_fingerprint IS NOT NULL AND source_fingerprint_kind IN "
            "('image', 'pdf_render'))",
            name="source_fingerprint_kind_valid",
        ),
        CheckConstraint("jsonb_typeof(ocr_lines) = 'array'", name="ocr_lines_array"),
        CheckConstraint(
            "ocr_status IN ('pending', 'processing', 'completed', 'failed')",
            name="ocr_status_valid",
        ),
        CheckConstraint(
            "text_source IN ('none', 'ocr', 'pdf_text', 'user_edit')",
            name="text_source_valid",
        ),
        CheckConstraint(
            "text_quality IS NULL OR text_quality IN ('ok', 'empty', 'low_confidence')",
            name="text_quality_valid",
        ),
        CheckConstraint(
            "ocr_confidence_mean IS NULL OR "
            "(ocr_confidence_mean >= 0 AND ocr_confidence_mean <= 1)",
            name="ocr_confidence_mean_valid",
        ),
        Index("ix_manual_pages_manual_id", manual_id),
        Index("ix_manual_pages_image_asset_id", image_asset_id),
        Index("ix_manual_pages_source_fingerprint", source_fingerprint),
        Index("ix_manual_pages_source_reused_from_page_id", source_reused_from_page_id),
        Index("uq_manual_pages_manual_page_number", manual_id, page_number, unique=True),
    )


class ManualChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Chunk canónico usado para reconstruir el índice de Chroma."""

    __tablename__ = "manual_chunks"

    manual_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("manuals.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("manual_pages.id", ondelete=ON_DELETE_SET_NULL),
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source_page: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(SHA256_HEX_LENGTH), nullable=False)
    embedding_model: Mapped[str | None] = mapped_column(String(EMBEDDING_MODEL_MAX_LENGTH))
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("chunk_index >= 0", name="chunk_index_non_negative"),
        CheckConstraint("length(btrim(text)) > 0", name="text_not_empty"),
        CheckConstraint("source_page > 0", name="source_page_positive"),
        CheckConstraint(
            f"length(content_hash) = {SHA256_HEX_LENGTH}",
            name="content_hash_length_valid",
        ),
        CheckConstraint(
            "embedding_model IS NULL OR length(btrim(embedding_model)) > 0",
            name="embedding_model_not_empty",
        ),
        Index("ix_manual_chunks_manual_id", manual_id),
        Index("ix_manual_chunks_page_id", page_id),
        Index("ix_manual_chunks_content_hash", content_hash),
        Index("uq_manual_chunks_manual_chunk_index", manual_id, chunk_index, unique=True),
    )
