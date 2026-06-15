"""Crea los seguimientos explícitos de juegos.

Revision ID: 0018
Revises: 0017
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
GAMES_TABLE = "games"
GAME_FOLLOWS_TABLE = "game_follows"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"
FOLLOWING_COLUMN = "following"

UUID_V7_DEFAULT = sa.text("uuidv7()")
CASCADE_ON_DELETE = "CASCADE"


def upgrade() -> None:
    """Crea una fila de seguimiento por usuario y juego."""
    op.create_table(
        GAME_FOLLOWS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(GAME_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            FOLLOWING_COLUMN,
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_game_follows_user_id_users"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.ForeignKeyConstraint(
            [GAME_ID_COLUMN],
            [f"{GAMES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_game_follows_game_id_games"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_game_follows")),
    )
    op.create_index(
        "uq_game_follows_user_game",
        GAME_FOLLOWS_TABLE,
        [USER_ID_COLUMN, GAME_ID_COLUMN],
        unique=True,
    )
    op.create_index("ix_game_follows_user_id", GAME_FOLLOWS_TABLE, [USER_ID_COLUMN])


def downgrade() -> None:
    """Elimina los seguimientos de juegos."""
    op.drop_index("ix_game_follows_user_id", table_name=GAME_FOLLOWS_TABLE)
    op.drop_index("uq_game_follows_user_game", table_name=GAME_FOLLOWS_TABLE)
    op.drop_table(GAME_FOLLOWS_TABLE)
