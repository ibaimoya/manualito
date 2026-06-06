"""Prepara manuales multipágina.

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ASSETS_TABLE = "assets"
MANUALS_TABLE = "manuals"
MANUAL_PAGES_TABLE = "manual_pages"

ID_COLUMN = "id"
SOURCE_ASSET_ID_COLUMN = "source_asset_id"
SOURCE_TYPE_COLUMN = "source_type"
PAGE_COUNT_COLUMN = "page_count"
TEXT_SOURCE_COLUMN = "text_source"
TEXT_QUALITY_COLUMN = "text_quality"
OCR_CONFIDENCE_MEAN_COLUMN = "ocr_confidence_mean"


def upgrade() -> None:
    """Extiende el esquema para originales PDF y estado por página."""
    op.drop_constraint(op.f("ck_assets_kind_valid"), ASSETS_TABLE, type_="check")
    op.create_check_constraint(
        op.f("ck_assets_kind_valid"),
        ASSETS_TABLE,
        "kind IN ('avatar', 'manual_page_image', 'manual_source_pdf')",
    )

    op.add_column(
        MANUALS_TABLE,
        sa.Column(SOURCE_ASSET_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(MANUALS_TABLE, sa.Column(SOURCE_TYPE_COLUMN, sa.String(length=16)))
    op.add_column(MANUALS_TABLE, sa.Column(PAGE_COUNT_COLUMN, sa.Integer()))
    op.execute("UPDATE manuals SET source_type = 'images' WHERE source_type IS NULL")
    op.execute(
        """
        UPDATE manuals
        SET page_count = GREATEST(
            1,
            COALESCE(
                (SELECT count(*) FROM manual_pages WHERE manual_pages.manual_id = manuals.id),
                0
            )
        )
        WHERE page_count IS NULL
        """
    )
    op.alter_column(
        MANUALS_TABLE,
        SOURCE_TYPE_COLUMN,
        existing_type=sa.String(length=16),
        nullable=False,
        server_default=sa.text("'images'"),
    )
    op.alter_column(
        MANUALS_TABLE,
        PAGE_COUNT_COLUMN,
        existing_type=sa.Integer(),
        nullable=False,
        server_default=sa.text("1"),
    )
    op.create_foreign_key(
        op.f("fk_manuals_source_asset_id_assets"),
        MANUALS_TABLE,
        ASSETS_TABLE,
        [SOURCE_ASSET_ID_COLUMN],
        [ID_COLUMN],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        op.f("ck_manuals_source_type_valid"),
        MANUALS_TABLE,
        "source_type IN ('images', 'pdf')",
    )
    op.create_check_constraint(
        op.f("ck_manuals_page_count_positive"),
        MANUALS_TABLE,
        "page_count > 0",
    )
    op.create_index(
        "ix_manuals_source_asset_id",
        MANUALS_TABLE,
        [SOURCE_ASSET_ID_COLUMN],
    )

    op.add_column(MANUAL_PAGES_TABLE, sa.Column(TEXT_SOURCE_COLUMN, sa.String(length=16)))
    op.add_column(MANUAL_PAGES_TABLE, sa.Column(TEXT_QUALITY_COLUMN, sa.String(length=24)))
    op.add_column(MANUAL_PAGES_TABLE, sa.Column(OCR_CONFIDENCE_MEAN_COLUMN, sa.Float()))
    op.execute(
        """
        UPDATE manual_pages
        SET text_source = CASE
                WHEN ocr_status = 'completed' THEN 'ocr'
                ELSE 'none'
            END,
            text_quality = CASE
                WHEN ocr_status = 'completed' THEN 'ok'
                ELSE NULL
            END
        WHERE text_source IS NULL
        """
    )
    op.alter_column(
        MANUAL_PAGES_TABLE,
        TEXT_SOURCE_COLUMN,
        existing_type=sa.String(length=16),
        nullable=False,
        server_default=sa.text("'none'"),
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_text_source_valid"),
        MANUAL_PAGES_TABLE,
        "text_source IN ('none', 'ocr', 'pdf_text')",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_text_quality_valid"),
        MANUAL_PAGES_TABLE,
        "text_quality IS NULL OR text_quality IN ('ok', 'empty', 'low_confidence')",
    )
    op.create_check_constraint(
        op.f("ck_manual_pages_ocr_confidence_mean_valid"),
        MANUAL_PAGES_TABLE,
        "ocr_confidence_mean IS NULL OR "
        "(ocr_confidence_mean >= 0 AND ocr_confidence_mean <= 1)",
    )


def downgrade() -> None:
    """Revierte columnas multipágina y el nuevo tipo de asset PDF."""
    op.drop_constraint(
        op.f("ck_manual_pages_ocr_confidence_mean_valid"),
        MANUAL_PAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_manual_pages_text_quality_valid"),
        MANUAL_PAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_manual_pages_text_source_valid"),
        MANUAL_PAGES_TABLE,
        type_="check",
    )
    op.drop_column(MANUAL_PAGES_TABLE, OCR_CONFIDENCE_MEAN_COLUMN)
    op.drop_column(MANUAL_PAGES_TABLE, TEXT_QUALITY_COLUMN)
    op.drop_column(MANUAL_PAGES_TABLE, TEXT_SOURCE_COLUMN)

    op.execute(
        """
        UPDATE manuals
        SET source_asset_id = NULL
        WHERE source_asset_id IN (
            SELECT id FROM assets WHERE kind = 'manual_source_pdf'
        )
        """
    )
    op.execute("DELETE FROM assets WHERE kind = 'manual_source_pdf'")

    op.drop_index("ix_manuals_source_asset_id", table_name=MANUALS_TABLE)
    op.drop_constraint(op.f("ck_manuals_page_count_positive"), MANUALS_TABLE, type_="check")
    op.drop_constraint(op.f("ck_manuals_source_type_valid"), MANUALS_TABLE, type_="check")
    op.drop_constraint(
        op.f("fk_manuals_source_asset_id_assets"),
        MANUALS_TABLE,
        type_="foreignkey",
    )
    op.drop_column(MANUALS_TABLE, PAGE_COUNT_COLUMN)
    op.drop_column(MANUALS_TABLE, SOURCE_TYPE_COLUMN)
    op.drop_column(MANUALS_TABLE, SOURCE_ASSET_ID_COLUMN)

    op.drop_constraint(op.f("ck_assets_kind_valid"), ASSETS_TABLE, type_="check")
    op.create_check_constraint(
        op.f("ck_assets_kind_valid"),
        ASSETS_TABLE,
        "kind IN ('avatar', 'manual_page_image')",
    )
