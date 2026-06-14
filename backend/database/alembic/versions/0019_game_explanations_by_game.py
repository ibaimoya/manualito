"""Asocia las explicaciones generadas al juego.

Revision ID: 0019
Revises: 0018
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
EXPLANATIONS_TABLE = "game_explanations"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"
CASCADE_ON_DELETE = "CASCADE"


def upgrade() -> None:
    """Deja una única explicación cacheada por juego."""
    op.execute(
        sa.text(
            f"""
            DELETE FROM {EXPLANATIONS_TABLE} AS explanation
            USING (
                SELECT {ID_COLUMN}
                FROM (
                    SELECT
                        {ID_COLUMN},
                        row_number() OVER (
                            PARTITION BY {GAME_ID_COLUMN}
                            ORDER BY generated_at DESC, updated_at DESC, created_at DESC, {ID_COLUMN} DESC
                        ) AS row_number
                    FROM {EXPLANATIONS_TABLE}
                ) AS ranked
                WHERE row_number > 1
            ) AS stale
            WHERE explanation.{ID_COLUMN} = stale.{ID_COLUMN}
            """
        )
    )
    op.drop_index("ix_game_explanations_game_id", table_name=EXPLANATIONS_TABLE)
    op.drop_index("uq_game_explanations_user_game", table_name=EXPLANATIONS_TABLE)
    op.drop_constraint(
        op.f("fk_game_explanations_user_id_users"),
        EXPLANATIONS_TABLE,
        type_="foreignkey",
    )
    op.drop_column(EXPLANATIONS_TABLE, USER_ID_COLUMN)
    op.create_index(
        "uq_game_explanations_game_id",
        EXPLANATIONS_TABLE,
        [GAME_ID_COLUMN],
        unique=True,
    )


def downgrade() -> None:
    """Restaura la forma anterior, sin recuperar el dueño original de la caché."""
    op.drop_index("uq_game_explanations_game_id", table_name=EXPLANATIONS_TABLE)
    op.add_column(
        EXPLANATIONS_TABLE,
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_game_explanations_user_id_users"),
        EXPLANATIONS_TABLE,
        USERS_TABLE,
        [USER_ID_COLUMN],
        [ID_COLUMN],
        ondelete=CASCADE_ON_DELETE,
    )
    op.create_index(
        "uq_game_explanations_user_game",
        EXPLANATIONS_TABLE,
        [USER_ID_COLUMN, GAME_ID_COLUMN],
        unique=True,
    )
    op.create_index("ix_game_explanations_game_id", EXPLANATIONS_TABLE, [GAME_ID_COLUMN])
