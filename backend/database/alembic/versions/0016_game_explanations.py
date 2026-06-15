"""Crea las explicaciones de juego cacheadas por usuario.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
GAMES_TABLE = "games"
EXPLANATIONS_TABLE = "game_explanations"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"

UUID_V7_DEFAULT = sa.text("uuidv7()")
CASCADE_ON_DELETE = "CASCADE"
RESTRICT_ON_DELETE = "RESTRICT"
SHA256_HEX_LENGTH = 64


def upgrade() -> None:
    """Crea la caché de explicaciones con huella del pool de origen."""
    op.create_table(
        EXPLANATIONS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(GAME_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sections", postgresql.JSONB(), nullable=False),
        sa.Column(
            "source_fingerprint",
            sa.String(length=SHA256_HEX_LENGTH),
            nullable=False,
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
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
        sa.CheckConstraint(
            "jsonb_typeof(sections) = 'object'",
            name=op.f("ck_game_explanations_sections_object"),
        ),
        sa.CheckConstraint(
            f"length(source_fingerprint) = {SHA256_HEX_LENGTH}",
            name=op.f("ck_game_explanations_source_fingerprint_length_valid"),
        ),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_game_explanations_user_id_users"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.ForeignKeyConstraint(
            [GAME_ID_COLUMN],
            [f"{GAMES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_game_explanations_game_id_games"),
            ondelete=RESTRICT_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_game_explanations")),
    )
    op.create_index(
        "uq_game_explanations_user_game",
        EXPLANATIONS_TABLE,
        [USER_ID_COLUMN, GAME_ID_COLUMN],
        unique=True,
    )
    op.create_index("ix_game_explanations_game_id", EXPLANATIONS_TABLE, [GAME_ID_COLUMN])


def downgrade() -> None:
    """Elimina la caché de explicaciones."""
    op.drop_index("ix_game_explanations_game_id", table_name=EXPLANATIONS_TABLE)
    op.drop_index("uq_game_explanations_user_game", table_name=EXPLANATIONS_TABLE)
    op.drop_table(EXPLANATIONS_TABLE)
