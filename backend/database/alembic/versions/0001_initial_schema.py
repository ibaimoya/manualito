"""Esquema inicial vacío.

Revision ID: 0001
Revises:
Create Date: 2026-05-28
"""

from collections.abc import Sequence

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Mantiene una revisión inicial vacía para anclar Alembic."""
    pass  # Sin cambios de esquema: esta revisión ancla el historial de Alembic.


def downgrade() -> None:
    """No revierte cambios porque la revisión inicial no crea esquema."""
    pass  # Sin cambios de esquema que revertir en la revisión inicial.
