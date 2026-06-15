"""Modelo de seguimiento de juegos por usuario."""

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import TimestampMixin, UUIDPrimaryKeyMixin


class GameFollow(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Seguimiento de un juego por un usuario; following=false recuerda un unfollow explicito."""

    __tablename__ = "game_follows"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("games.id", ondelete="CASCADE"),
        nullable=False,
    )
    following: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
    )

    __table_args__ = (
        Index("uq_game_follows_user_game", user_id, game_id, unique=True),
        Index("ix_game_follows_user_id", user_id),
    )
