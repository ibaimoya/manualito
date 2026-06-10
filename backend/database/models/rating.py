"""Modelo de valoraciones de juegos por usuario."""

from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import RATING_NOTE_MAX_LENGTH


class Rating(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Valoración personal de un usuario sobre un juego."""

    __tablename__ = "ratings"

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
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(String(RATING_NOTE_MAX_LENGTH))

    __table_args__ = (
        CheckConstraint("score >= 1 AND score <= 5", name="score_valid"),
        CheckConstraint(
            "note IS NULL OR (length(btrim(note)) > 0 AND note = btrim(note))",
            name="note_valid",
        ),
        Index("uq_ratings_user_game", user_id, game_id, unique=True),
        Index("ix_ratings_game_id", game_id),
    )
