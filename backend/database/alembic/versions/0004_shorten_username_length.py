"""Limita username visible a veinte caracteres.

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
USERNAME_COLUMN = "username"


def upgrade() -> None:
    """Reduce el username visible para que encaje mejor en la interfaz."""
    op.alter_column(
        USERS_TABLE,
        USERNAME_COLUMN,
        existing_type=sa.String(length=80),
        type_=sa.String(length=20),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Permite volver al limite anterior de ochenta caracteres."""
    op.alter_column(
        USERS_TABLE,
        USERNAME_COLUMN,
        existing_type=sa.String(length=20),
        type_=sa.String(length=80),
        existing_nullable=False,
    )
