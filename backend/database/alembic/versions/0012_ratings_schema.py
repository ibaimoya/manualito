"""Crea las valoraciones de juegos por usuario.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
GAMES_TABLE = "games"
RATINGS_TABLE = "ratings"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"

UUID_V7_DEFAULT = sa.text("uuidv7()")
CASCADE_ON_DELETE = "CASCADE"
RESTRICT_ON_DELETE = "RESTRICT"
RATING_NOTE_MAX_LENGTH = 120


def upgrade() -> None:
    """Crea la tabla de valoraciones con una fila por usuario y juego."""
    op.create_table(
        RATINGS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(GAME_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(length=RATING_NOTE_MAX_LENGTH), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "score >= 1 AND score <= 5",
            name=op.f("ck_ratings_score_valid"),
        ),
        sa.CheckConstraint(
            "note IS NULL OR (length(btrim(note)) > 0 AND note = btrim(note))",
            name=op.f("ck_ratings_note_valid"),
        ),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_ratings_user_id_users"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.ForeignKeyConstraint(
            [GAME_ID_COLUMN],
            [f"{GAMES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_ratings_game_id_games"),
            ondelete=RESTRICT_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_ratings")),
    )
    op.create_index(
        "uq_ratings_user_game",
        RATINGS_TABLE,
        [USER_ID_COLUMN, GAME_ID_COLUMN],
        unique=True,
    )
    op.create_index("ix_ratings_game_id", RATINGS_TABLE, [GAME_ID_COLUMN])


def downgrade() -> None:
    """Elimina las valoraciones de juegos."""
    op.drop_index("ix_ratings_game_id", table_name=RATINGS_TABLE)
    op.drop_index("uq_ratings_user_game", table_name=RATINGS_TABLE)
    op.drop_table(RATINGS_TABLE)
