"""Limita email a doscientos cincuenta y cuatro caracteres.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
EMAIL_COLUMN = "email"


def upgrade() -> None:
    """Alinea la columna con el límite interoperable habitual de email."""
    op.alter_column(
        USERS_TABLE,
        EMAIL_COLUMN,
        existing_type=sa.String(length=320),
        type_=sa.String(length=254),
        existing_nullable=False,
    )


def downgrade() -> None:
    """Permite volver al límite anterior de trescientos veinte caracteres."""
    op.alter_column(
        USERS_TABLE,
        EMAIL_COLUMN,
        existing_type=sa.String(length=254),
        type_=sa.String(length=320),
        existing_nullable=False,
    )
