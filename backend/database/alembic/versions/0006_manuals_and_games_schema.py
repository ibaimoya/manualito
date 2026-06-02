"""Crea juegos, manuales, páginas OCR y chunks.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
ASSETS_TABLE = "assets"
GAMES_TABLE = "games"
MANUALS_TABLE = "manuals"
MANUAL_PAGES_TABLE = "manual_pages"
MANUAL_CHUNKS_TABLE = "manual_chunks"

ID_COLUMN = "id"
OWNER_USER_ID_COLUMN = "owner_user_id"
CREATED_BY_USER_ID_COLUMN = "created_by_user_id"
GAME_ID_COLUMN = "game_id"
MANUAL_ID_COLUMN = "manual_id"
PAGE_ID_COLUMN = "page_id"
IMAGE_ASSET_ID_COLUMN = "image_asset_id"
CREATED_AT_COLUMN = "created_at"
UPDATED_AT_COLUMN = "updated_at"
DELETED_AT_COLUMN = "deleted_at"

UUID_V7_DEFAULT = sa.text("uuidv7()")
JSON_EMPTY_ARRAY_DEFAULT = sa.text("'[]'::jsonb")
ACTIVE_ROW_FILTER = sa.text("deleted_at IS NULL")
SET_NULL_ON_DELETE = "SET NULL"


def upgrade() -> None:
    """Crea la fuente de verdad de manuales y el catálogo de juegos."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        GAMES_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("name_key", sa.String(length=512), nullable=False),
        sa.Column("bgg_id", sa.Integer(), nullable=True),
        sa.Column("year_published", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column(CREATED_BY_USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            UPDATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(DELETED_AT_COLUMN, sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(btrim(name)) > 0", name=op.f("ck_games_name_not_empty")),
        sa.CheckConstraint("name = btrim(name)", name=op.f("ck_games_name_trimmed")),
        sa.CheckConstraint(
            "length(name_key) > 0",
            name=op.f("ck_games_name_key_not_empty"),
        ),
        sa.CheckConstraint(
            "bgg_id IS NULL OR bgg_id > 0",
            name=op.f("ck_games_bgg_id_positive"),
        ),
        sa.CheckConstraint(
            "year_published IS NULL OR year_published > 0",
            name=op.f("ck_games_year_published_positive"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'hidden')",
            name=op.f("ck_games_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            [CREATED_BY_USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_games_created_by_user_id_users"),
            ondelete=SET_NULL_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_games")),
    )
    op.create_index("ix_games_name_key", GAMES_TABLE, ["name_key"])
    op.create_index(
        "ix_games_name_trgm",
        GAMES_TABLE,
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "uq_games_bgg_id_active",
        GAMES_TABLE,
        ["bgg_id"],
        unique=True,
        postgresql_where=sa.text("bgg_id IS NOT NULL AND deleted_at IS NULL"),
    )

    op.create_table(
        MANUALS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(OWNER_USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(GAME_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=24),
            server_default=sa.text("'indexing'"),
            nullable=False,
        ),
        sa.Column("language", sa.String(length=35), nullable=True),
        sa.Column(
            "visibility",
            sa.String(length=16),
            server_default=sa.text("'private'"),
            nullable=False,
        ),
        sa.Column("chunks_indexed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            UPDATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(DELETED_AT_COLUMN, sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "title IS NULL OR (length(btrim(title)) > 0 AND title = btrim(title))",
            name=op.f("ck_manuals_title_valid"),
        ),
        sa.CheckConstraint(
            "status IN ('indexing', 'active', 'pending_review', 'hidden', 'failed')",
            name=op.f("ck_manuals_status_valid"),
        ),
        sa.CheckConstraint(
            "language IS NULL OR length(btrim(language)) > 0",
            name=op.f("ck_manuals_language_not_empty"),
        ),
        sa.CheckConstraint(
            "visibility IN ('shared', 'private')",
            name=op.f("ck_manuals_visibility_valid"),
        ),
        sa.CheckConstraint(
            "chunks_indexed >= 0",
            name=op.f("ck_manuals_chunks_indexed_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            [OWNER_USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manuals_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            [GAME_ID_COLUMN],
            [f"{GAMES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manuals_game_id_games"),
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_manuals")),
    )
    op.create_index("ix_manuals_owner_user_id", MANUALS_TABLE, [OWNER_USER_ID_COLUMN])
    op.create_index("ix_manuals_game_id", MANUALS_TABLE, [GAME_ID_COLUMN])
    op.create_index(
        "ix_manuals_game_shared_active",
        MANUALS_TABLE,
        [GAME_ID_COLUMN],
        postgresql_where=sa.text(
            "visibility = 'shared' AND status = 'active' AND deleted_at IS NULL"
        ),
    )

    op.create_table(
        MANUAL_PAGES_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(MANUAL_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column(IMAGE_ASSET_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "ocr_lines",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=JSON_EMPTY_ARRAY_DEFAULT,
            nullable=False,
        ),
        sa.Column(
            "ocr_status",
            sa.String(length=24),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("ocr_engine", sa.String(length=80), nullable=True),
        sa.Column("ocr_version", sa.String(length=80), nullable=True),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            UPDATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "page_number > 0",
            name=op.f("ck_manual_pages_page_number_positive"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(ocr_lines) = 'array'",
            name=op.f("ck_manual_pages_ocr_lines_array"),
        ),
        sa.CheckConstraint(
            "ocr_status IN ('pending', 'completed', 'failed')",
            name=op.f("ck_manual_pages_ocr_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            [IMAGE_ASSET_ID_COLUMN],
            [f"{ASSETS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manual_pages_image_asset_id_assets"),
            ondelete=SET_NULL_ON_DELETE,
        ),
        sa.ForeignKeyConstraint(
            [MANUAL_ID_COLUMN],
            [f"{MANUALS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manual_pages_manual_id_manuals"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_manual_pages")),
    )
    op.create_index("ix_manual_pages_manual_id", MANUAL_PAGES_TABLE, [MANUAL_ID_COLUMN])
    op.create_index(
        "ix_manual_pages_image_asset_id",
        MANUAL_PAGES_TABLE,
        [IMAGE_ASSET_ID_COLUMN],
    )
    op.create_index(
        "uq_manual_pages_manual_page_number",
        MANUAL_PAGES_TABLE,
        [MANUAL_ID_COLUMN, "page_number"],
        unique=True,
    )

    op.create_table(
        MANUAL_CHUNKS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(MANUAL_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(PAGE_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("source_page", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding_model", sa.String(length=128), nullable=True),
        sa.Column("indexed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            UPDATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "chunk_index >= 0",
            name=op.f("ck_manual_chunks_chunk_index_non_negative"),
        ),
        sa.CheckConstraint(
            "length(btrim(text)) > 0",
            name=op.f("ck_manual_chunks_text_not_empty"),
        ),
        sa.CheckConstraint(
            "source_page > 0",
            name=op.f("ck_manual_chunks_source_page_positive"),
        ),
        sa.CheckConstraint(
            "length(content_hash) = 64",
            name=op.f("ck_manual_chunks_content_hash_length_valid"),
        ),
        sa.CheckConstraint(
            "embedding_model IS NULL OR length(btrim(embedding_model)) > 0",
            name=op.f("ck_manual_chunks_embedding_model_not_empty"),
        ),
        sa.ForeignKeyConstraint(
            [MANUAL_ID_COLUMN],
            [f"{MANUALS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manual_chunks_manual_id_manuals"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            [PAGE_ID_COLUMN],
            [f"{MANUAL_PAGES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_manual_chunks_page_id_manual_pages"),
            ondelete=SET_NULL_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_manual_chunks")),
    )
    op.create_index("ix_manual_chunks_manual_id", MANUAL_CHUNKS_TABLE, [MANUAL_ID_COLUMN])
    op.create_index("ix_manual_chunks_page_id", MANUAL_CHUNKS_TABLE, [PAGE_ID_COLUMN])
    op.create_index("ix_manual_chunks_content_hash", MANUAL_CHUNKS_TABLE, ["content_hash"])
    op.create_index(
        "uq_manual_chunks_manual_chunk_index",
        MANUAL_CHUNKS_TABLE,
        [MANUAL_ID_COLUMN, "chunk_index"],
        unique=True,
    )


def downgrade() -> None:
    """Elimina manuales, páginas OCR, chunks y catálogo de juegos."""
    op.drop_index("uq_manual_chunks_manual_chunk_index", table_name=MANUAL_CHUNKS_TABLE)
    op.drop_index("ix_manual_chunks_content_hash", table_name=MANUAL_CHUNKS_TABLE)
    op.drop_index("ix_manual_chunks_page_id", table_name=MANUAL_CHUNKS_TABLE)
    op.drop_index("ix_manual_chunks_manual_id", table_name=MANUAL_CHUNKS_TABLE)
    op.drop_table(MANUAL_CHUNKS_TABLE)

    op.drop_index("uq_manual_pages_manual_page_number", table_name=MANUAL_PAGES_TABLE)
    op.drop_index("ix_manual_pages_image_asset_id", table_name=MANUAL_PAGES_TABLE)
    op.drop_index("ix_manual_pages_manual_id", table_name=MANUAL_PAGES_TABLE)
    op.drop_table(MANUAL_PAGES_TABLE)

    op.drop_index("ix_manuals_game_shared_active", table_name=MANUALS_TABLE)
    op.drop_index("ix_manuals_game_id", table_name=MANUALS_TABLE)
    op.drop_index("ix_manuals_owner_user_id", table_name=MANUALS_TABLE)
    op.drop_table(MANUALS_TABLE)

    op.drop_index("uq_games_bgg_id_active", table_name=GAMES_TABLE)
    op.drop_index("ix_games_name_trgm", table_name=GAMES_TABLE)
    op.drop_index("ix_games_name_key", table_name=GAMES_TABLE)
    op.drop_table(GAMES_TABLE)
