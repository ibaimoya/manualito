"""Añade estado asíncrono a las explicaciones de juego.

Revision ID: 0021
Revises: 0020
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EXPLANATIONS_TABLE = "game_explanations"
STATUS_COLUMN = "status"
ERROR_CODE_COLUMN = "error_code"


def upgrade() -> None:
    """Distingue cachés listas, en generación y fallidas."""
    op.add_column(
        EXPLANATIONS_TABLE,
        sa.Column(
            STATUS_COLUMN,
            sa.String(length=16),
            server_default=sa.text("'ready'"),
            nullable=False,
        ),
    )
    op.add_column(
        EXPLANATIONS_TABLE,
        sa.Column(ERROR_CODE_COLUMN, sa.String(length=64), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_game_explanations_status_valid"),
        EXPLANATIONS_TABLE,
        "status IN ('ready', 'generating', 'failed')",
    )
    op.create_check_constraint(
        op.f("ck_game_explanations_error_code_only_when_failed"),
        EXPLANATIONS_TABLE,
        "error_code IS NULL OR status = 'failed'",
    )


def downgrade() -> None:
    """Vuelve a la caché sin estado persistido."""
    op.drop_constraint(
        op.f("ck_game_explanations_error_code_only_when_failed"),
        EXPLANATIONS_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_game_explanations_status_valid"),
        EXPLANATIONS_TABLE,
        type_="check",
    )
    op.drop_column(EXPLANATIONS_TABLE, ERROR_CODE_COLUMN)
    op.drop_column(EXPLANATIONS_TABLE, STATUS_COLUMN)
