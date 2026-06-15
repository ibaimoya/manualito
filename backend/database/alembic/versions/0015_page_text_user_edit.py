"""Admite texto de página corregido a mano por el usuario.

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MANUAL_PAGES_TABLE = "manual_pages"
TEXT_SOURCE_CONSTRAINT = "ck_manual_pages_text_source_valid"


def upgrade() -> None:
    """Añade 'user_edit' a los orígenes de texto válidos."""
    op.drop_constraint(op.f(TEXT_SOURCE_CONSTRAINT), MANUAL_PAGES_TABLE, type_="check")
    op.create_check_constraint(
        op.f(TEXT_SOURCE_CONSTRAINT),
        MANUAL_PAGES_TABLE,
        "text_source IN ('none', 'ocr', 'pdf_text', 'user_edit')",
    )


def downgrade() -> None:
    """Restringe los orígenes de texto a los automáticos."""
    op.drop_constraint(op.f(TEXT_SOURCE_CONSTRAINT), MANUAL_PAGES_TABLE, type_="check")
    op.create_check_constraint(
        op.f(TEXT_SOURCE_CONSTRAINT),
        MANUAL_PAGES_TABLE,
        "text_source IN ('none', 'ocr', 'pdf_text')",
    )
