"""Añade estado processing a las páginas de manual.

Revision ID: 0022
Revises: 0021
Create Date: 2026-06-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PAGES_TABLE = "manual_pages"
STATUS_COLUMN = "ocr_status"


def upgrade() -> None:
    """Permite distinguir páginas encoladas de páginas en ejecución."""
    op.drop_constraint(
        op.f("ck_manual_pages_ocr_status_valid"),
        PAGES_TABLE,
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_ocr_status_valid"),
        PAGES_TABLE,
        "ocr_status IN ('pending', 'processing', 'completed', 'failed')",
    )


def downgrade() -> None:
    """Vuelve al contrato anterior sin páginas en ejecución persistidas."""
    op.execute(
        f"UPDATE {PAGES_TABLE} SET {STATUS_COLUMN} = 'failed' "
        f"WHERE {STATUS_COLUMN} = 'processing'"
    )
    op.drop_constraint(
        op.f("ck_manual_pages_ocr_status_valid"),
        PAGES_TABLE,
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_ocr_status_valid"),
        PAGES_TABLE,
        "ocr_status IN ('pending', 'completed', 'failed')",
    )
