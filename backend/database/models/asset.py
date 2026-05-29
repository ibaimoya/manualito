"""Modelo de assets propiedad de usuarios."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
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
from database.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class Asset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Archivo persistido fuera de las tablas principales."""

    __tablename__ = "assets"

    owner_user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("kind IN ('avatar', 'manual_page_image')", name="kind_valid"),
        CheckConstraint("byte_size > 0", name="byte_size_positive"),
        CheckConstraint("length(sha256) = 64", name="sha256_length_valid"),
        CheckConstraint("width IS NULL OR width > 0", name="width_positive"),
        CheckConstraint("height IS NULL OR height > 0", name="height_positive"),
        Index("ix_assets_owner_user_id", owner_user_id),
        Index("ix_assets_kind", kind),
        Index(
            "uq_assets_owner_avatar_active",
            owner_user_id,
            unique=True,
            postgresql_where=text("kind = 'avatar' AND deleted_at IS NULL"),
        ),
    )
