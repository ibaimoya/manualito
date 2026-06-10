"""Modelo de catálogo de juegos."""

from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import GAME_NAME_KEY_MAX_LENGTH, GAME_NAME_MAX_LENGTH


class Game(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Juego canónico sobre el que se agregan manuales."""

    __tablename__ = "games"

    name: Mapped[str] = mapped_column(String(GAME_NAME_MAX_LENGTH), nullable=False)
    name_key: Mapped[str] = mapped_column(String(GAME_NAME_KEY_MAX_LENGTH), nullable=False)
    bgg_id: Mapped[int | None] = mapped_column(Integer)
    year_published: Mapped[int | None] = mapped_column(Integer)
    min_players: Mapped[int | None] = mapped_column(Integer)
    max_players: Mapped[int | None] = mapped_column(Integer)
    playing_time_minutes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'active'"),
    )
    created_by_user_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        CheckConstraint("length(btrim(name)) > 0", name="name_not_empty"),
        CheckConstraint("name = btrim(name)", name="name_trimmed"),
        CheckConstraint("length(name_key) > 0", name="name_key_not_empty"),
        CheckConstraint("bgg_id IS NULL OR bgg_id > 0", name="bgg_id_positive"),
        CheckConstraint(
            "year_published IS NULL OR year_published > 0",
            name="year_published_positive",
        ),
        CheckConstraint(
            "min_players IS NULL OR min_players > 0",
            name="min_players_positive",
        ),
        CheckConstraint(
            "max_players IS NULL OR max_players > 0",
            name="max_players_positive",
        ),
        CheckConstraint(
            "playing_time_minutes IS NULL OR playing_time_minutes > 0",
            name="playing_time_minutes_positive",
        ),
        CheckConstraint("status IN ('active', 'hidden')", name="status_valid"),
        Index("ix_games_name_key", name_key),
        Index(
            "ix_games_name_trgm",
            name,
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "uq_games_bgg_id_active",
            bgg_id,
            unique=True,
            postgresql_where=text("bgg_id IS NOT NULL AND deleted_at IS NULL"),
        ),
    )
