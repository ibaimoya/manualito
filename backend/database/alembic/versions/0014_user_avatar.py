"""Añade el avatar configurable del perfil de usuario.

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"

AVATAR_COLOR_COLUMN = "avatar_color"
AVATAR_FIGURE_COLUMN = "avatar_figure"
AVATAR_COLOR_MAX_LENGTH = 16
AVATAR_FIGURE_MAX_LENGTH = 24


def upgrade() -> None:
    """Añade color y figura del avatar con valores cerrados."""
    op.add_column(
        USERS_TABLE,
        sa.Column(AVATAR_COLOR_COLUMN, sa.String(length=AVATAR_COLOR_MAX_LENGTH), nullable=True),
    )
    op.add_column(
        USERS_TABLE,
        sa.Column(
            AVATAR_FIGURE_COLUMN,
            sa.String(length=AVATAR_FIGURE_MAX_LENGTH),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        op.f("ck_users_avatar_color_valid"),
        USERS_TABLE,
        f"{AVATAR_COLOR_COLUMN} IS NULL OR {AVATAR_COLOR_COLUMN} IN "
        "('primary', 'accent', 'contrast', 'success', 'warning')",
    )
    op.create_check_constraint(
        op.f("ck_users_avatar_figure_valid"),
        USERS_TABLE,
        f"{AVATAR_FIGURE_COLUMN} IS NULL OR {AVATAR_FIGURE_COLUMN} IN "
        "('initials', 'meeple', 'dice', 'crown', 'flag', "
        "'sparkle', 'book', 'bulb', 'zap', 'hourglass')",
    )


def downgrade() -> None:
    """Quita el avatar configurable del usuario."""
    op.drop_constraint(op.f("ck_users_avatar_figure_valid"), USERS_TABLE, type_="check")
    op.drop_constraint(op.f("ck_users_avatar_color_valid"), USERS_TABLE, type_="check")
    op.drop_column(USERS_TABLE, AVATAR_FIGURE_COLUMN)
    op.drop_column(USERS_TABLE, AVATAR_COLOR_COLUMN)
