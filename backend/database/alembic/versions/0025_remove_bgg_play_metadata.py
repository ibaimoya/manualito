"""Retira metadatos de mesa importados desde BGG.

Revision ID: 0025
Revises: 0024
Create Date: 2026-06-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GAMES_TABLE = "games"
MIN_PLAYERS_COLUMN = "min_players"
MAX_PLAYERS_COLUMN = "max_players"
PLAYING_TIME_COLUMN = "playing_time_minutes"
PLAY_METADATA_FIELDS: tuple[tuple[str, str], ...] = (
    (MIN_PLAYERS_COLUMN, "ck_games_min_players_positive"),
    (MAX_PLAYERS_COLUMN, "ck_games_max_players_positive"),
    (PLAYING_TIME_COLUMN, "ck_games_playing_time_minutes_positive"),
)


def upgrade() -> None:
    """Elimina campos que ahora deben salir del manual, no de BGG."""
    for column_name, constraint_name in reversed(PLAY_METADATA_FIELDS):
        op.drop_constraint(op.f(constraint_name), GAMES_TABLE, type_="check")
        op.drop_column(GAMES_TABLE, column_name)


def downgrade() -> None:
    """Restaura los campos retirados de metadatos de mesa."""
    for column_name, constraint_name in PLAY_METADATA_FIELDS:
        op.add_column(GAMES_TABLE, sa.Column(column_name, sa.Integer(), nullable=True))
        op.create_check_constraint(
            op.f(constraint_name),
            GAMES_TABLE,
            f"{column_name} IS NULL OR {column_name} > 0",
        )
