"""Modelo de explicaciones de juego cacheadas por usuario."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import SHA256_HEX_LENGTH


class GameExplanation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Explicación generada para un usuario a partir de su pool visible."""

    __tablename__ = "game_explanations"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("games.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sections: Mapped[dict[str, object]] = mapped_column(postgresql.JSONB, nullable=False)
    source_fingerprint: Mapped[str] = mapped_column(
        String(SHA256_HEX_LENGTH),
        nullable=False,
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint("jsonb_typeof(sections) = 'object'", name="sections_object"),
        CheckConstraint(
            f"length(source_fingerprint) = {SHA256_HEX_LENGTH}",
            name="source_fingerprint_length_valid",
        ),
        Index("uq_game_explanations_user_game", user_id, game_id, unique=True),
        Index("ix_game_explanations_game_id", game_id),
    )
