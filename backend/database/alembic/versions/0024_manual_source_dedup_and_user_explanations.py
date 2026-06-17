"""Deduplica manuales completos y cachea explicaciones por usuario.

Revision ID: 0024
Revises: 0023
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
MANUALS_TABLE = "manuals"
EXPLANATIONS_TABLE = "game_explanations"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"
SOURCE_FINGERPRINT_COLUMN = "source_fingerprint"

SHA256_HEX_LENGTH = 64
CASCADE_ON_DELETE = "CASCADE"


def upgrade() -> None:
    """Añade barreras de BD para duplicados y caché personalizada."""
    op.add_column(
        MANUALS_TABLE,
        sa.Column(SOURCE_FINGERPRINT_COLUMN, sa.String(length=SHA256_HEX_LENGTH), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_manuals_source_fingerprint_length_valid"),
        MANUALS_TABLE,
        f"{SOURCE_FINGERPRINT_COLUMN} IS NULL OR "
        f"length({SOURCE_FINGERPRINT_COLUMN}) = {SHA256_HEX_LENGTH}",
    )
    op.create_index(
        "uq_manuals_live_source_fingerprint",
        MANUALS_TABLE,
        ["owner_user_id", GAME_ID_COLUMN, SOURCE_FINGERPRINT_COLUMN],
        unique=True,
        postgresql_where=sa.text(
            f"deleted_at IS NULL AND {SOURCE_FINGERPRINT_COLUMN} IS NOT NULL"
        ),
    )

    op.execute(sa.text(f"DELETE FROM {EXPLANATIONS_TABLE}"))
    op.drop_index("uq_game_explanations_game_id", table_name=EXPLANATIONS_TABLE)
    op.add_column(
        EXPLANATIONS_TABLE,
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
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


def downgrade() -> None:
    """Restaura la caché global por juego y retira la deduplicación completa."""
    op.execute(sa.text(f"DELETE FROM {EXPLANATIONS_TABLE}"))
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

    op.drop_index("uq_manuals_live_source_fingerprint", table_name=MANUALS_TABLE)
    op.drop_constraint(
        op.f("ck_manuals_source_fingerprint_length_valid"),
        MANUALS_TABLE,
        type_="check",
    )
    op.drop_column(MANUALS_TABLE, SOURCE_FINGERPRINT_COLUMN)
