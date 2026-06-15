"""Añade jugadores y duración al catálogo de juegos.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GAMES_TABLE = "games"

MIN_PLAYERS_COLUMN = "min_players"
MAX_PLAYERS_COLUMN = "max_players"
PLAYING_TIME_COLUMN = "playing_time_minutes"


def upgrade() -> None:
    """Añade columnas opcionales rellenadas perezosamente desde BGG."""
    op.add_column(GAMES_TABLE, sa.Column(MIN_PLAYERS_COLUMN, sa.Integer(), nullable=True))
    op.add_column(GAMES_TABLE, sa.Column(MAX_PLAYERS_COLUMN, sa.Integer(), nullable=True))
    op.add_column(GAMES_TABLE, sa.Column(PLAYING_TIME_COLUMN, sa.Integer(), nullable=True))
    op.create_check_constraint(
        op.f("ck_games_min_players_positive"),
        GAMES_TABLE,
        f"{MIN_PLAYERS_COLUMN} IS NULL OR {MIN_PLAYERS_COLUMN} > 0",
    )
    op.create_check_constraint(
        op.f("ck_games_max_players_positive"),
        GAMES_TABLE,
        f"{MAX_PLAYERS_COLUMN} IS NULL OR {MAX_PLAYERS_COLUMN} > 0",
    )
    op.create_check_constraint(
        op.f("ck_games_playing_time_minutes_positive"),
        GAMES_TABLE,
        f"{PLAYING_TIME_COLUMN} IS NULL OR {PLAYING_TIME_COLUMN} > 0",
    )


def downgrade() -> None:
    """Quita jugadores y duración del catálogo."""
    op.drop_constraint(op.f("ck_games_playing_time_minutes_positive"), GAMES_TABLE, type_="check")
    op.drop_constraint(op.f("ck_games_max_players_positive"), GAMES_TABLE, type_="check")
    op.drop_constraint(op.f("ck_games_min_players_positive"), GAMES_TABLE, type_="check")
    op.drop_column(GAMES_TABLE, PLAYING_TIME_COLUMN)
    op.drop_column(GAMES_TABLE, MAX_PLAYERS_COLUMN)
    op.drop_column(GAMES_TABLE, MIN_PLAYERS_COLUMN)
