"""Añade huellas de origen para reutilizar OCR por página.

Revision ID: 0023
Revises: 0022
Create Date: 2026-06-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MANUAL_PAGES_TABLE = "manual_pages"
ID_COLUMN = "id"
FINGERPRINT_COLUMN = "source_fingerprint"
FINGERPRINT_KIND_COLUMN = "source_fingerprint_kind"
REUSED_FROM_COLUMN = "source_reused_from_page_id"
REUSED_FROM_FK = "fk_manual_pages_source_reused_from_page_id_manual_pages"
REUSED_FROM_INDEX = "ix_manual_pages_source_reused_from_page_id"
SHA256_HEX_LENGTH = 64


def upgrade() -> None:
    """Guarda huellas de página para reutilizar resultados antes del OCR."""
    op.add_column(
        MANUAL_PAGES_TABLE,
        sa.Column(FINGERPRINT_COLUMN, sa.String(length=SHA256_HEX_LENGTH), nullable=True),
    )
    op.add_column(
        MANUAL_PAGES_TABLE,
        sa.Column(FINGERPRINT_KIND_COLUMN, sa.String(length=32), nullable=True),
    )
    op.add_column(
        MANUAL_PAGES_TABLE,
        sa.Column(REUSED_FROM_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f(REUSED_FROM_FK),
        MANUAL_PAGES_TABLE,
        MANUAL_PAGES_TABLE,
        [REUSED_FROM_COLUMN],
        [ID_COLUMN],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_source_fingerprint_length_valid"),
        MANUAL_PAGES_TABLE,
        f"{FINGERPRINT_COLUMN} IS NULL OR length({FINGERPRINT_COLUMN}) = {SHA256_HEX_LENGTH}",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_source_fingerprint_kind_valid"),
        MANUAL_PAGES_TABLE,
        f"({FINGERPRINT_COLUMN} IS NULL AND {FINGERPRINT_KIND_COLUMN} IS NULL) OR "
        f"({FINGERPRINT_COLUMN} IS NOT NULL AND {FINGERPRINT_KIND_COLUMN} IN "
        "('image', 'pdf_render'))",
    )
    op.create_index(
        "ix_manual_pages_source_fingerprint",
        MANUAL_PAGES_TABLE,
        [FINGERPRINT_COLUMN],
    )
    op.create_index(
        REUSED_FROM_INDEX,
        MANUAL_PAGES_TABLE,
        [REUSED_FROM_COLUMN],
    )


def downgrade() -> None:
    """Retira las huellas de página."""
    op.drop_index(REUSED_FROM_INDEX, table_name=MANUAL_PAGES_TABLE)
    op.drop_constraint(
        op.f(REUSED_FROM_FK),
        MANUAL_PAGES_TABLE,
        type_="foreignkey",
    )
    op.drop_column(MANUAL_PAGES_TABLE, REUSED_FROM_COLUMN)
    op.drop_index("ix_manual_pages_source_fingerprint", table_name=MANUAL_PAGES_TABLE)
    op.drop_constraint(
        op.f("ck_manual_pages_source_fingerprint_kind_valid"),
        MANUAL_PAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_manual_pages_source_fingerprint_length_valid"),
        MANUAL_PAGES_TABLE,
        type_="check",
    )
    op.drop_column(MANUAL_PAGES_TABLE, FINGERPRINT_KIND_COLUMN)
    op.drop_column(MANUAL_PAGES_TABLE, FINGERPRINT_COLUMN)
