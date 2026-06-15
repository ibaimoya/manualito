"""Amplía las figuras de avatar disponibles.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-11
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
AVATAR_FIGURE_COLUMN = "avatar_figure"
CONSTRAINT = "ck_users_avatar_figure_valid"

BASE_FIGURES = (
    "('initials', 'meeple', 'dice', 'crown', 'flag', "
    "'sparkle', 'book', 'bulb', 'zap', 'hourglass')"
)
EXTRA_FIGURES = (
    "('initials', 'meeple', 'dice', 'crown', 'flag', "
    "'sparkle', 'book', 'bulb', 'zap', 'hourglass', "
    "'trophy', 'puzzle', 'swords', 'ghost', 'shield', 'rocket')"
)


def upgrade() -> None:
    """Permite las seis figuras nuevas en el check del avatar."""
    op.drop_constraint(op.f(CONSTRAINT), USERS_TABLE, type_="check")
    op.create_check_constraint(
        op.f(CONSTRAINT),
        USERS_TABLE,
        f"{AVATAR_FIGURE_COLUMN} IS NULL OR {AVATAR_FIGURE_COLUMN} IN {EXTRA_FIGURES}",
    )


def downgrade() -> None:
    """Vuelve a la lista original; las figuras nuevas caen a NULL (iniciales)."""
    op.execute(
        f"UPDATE {USERS_TABLE} SET {AVATAR_FIGURE_COLUMN} = NULL "
        f"WHERE {AVATAR_FIGURE_COLUMN} NOT IN {BASE_FIGURES}",
    )
    op.drop_constraint(op.f(CONSTRAINT), USERS_TABLE, type_="check")
    op.create_check_constraint(
        op.f(CONSTRAINT),
        USERS_TABLE,
        f"{AVATAR_FIGURE_COLUMN} IS NULL OR {AVATAR_FIGURE_COLUMN} IN {BASE_FIGURES}",
    )
