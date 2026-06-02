"""Añade hash CSRF a sesiones de autenticación.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUTH_SESSIONS_TABLE = "auth_sessions"
CSRF_TOKEN_HASH_COLUMN = "csrf_token_hash"


def upgrade() -> None:
    """Guarda hash CSRF para validar requests mutantes autenticadas."""
    op.add_column(
        AUTH_SESSIONS_TABLE,
        sa.Column(CSRF_TOKEN_HASH_COLUMN, sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    """Elimina el hash CSRF de las sesiones."""
    op.drop_column(AUTH_SESSIONS_TABLE, CSRF_TOKEN_HASH_COLUMN)

