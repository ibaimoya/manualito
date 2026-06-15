"""Añade fuentes RAG persistidas en mensajes.

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MESSAGES_TABLE = "messages"
SOURCES_COLUMN = "sources"


def upgrade() -> None:
    """Guarda fuentes públicas usadas por respuestas de asistente."""
    op.add_column(
        MESSAGES_TABLE,
        sa.Column(
            SOURCES_COLUMN,
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        op.f("ck_messages_sources_array"),
        MESSAGES_TABLE,
        "jsonb_typeof(sources) = 'array'",
    )


def downgrade() -> None:
    """Elimina fuentes persistidas de mensajes."""
    op.drop_constraint(op.f("ck_messages_sources_array"), MESSAGES_TABLE, type_="check")
    op.drop_column(MESSAGES_TABLE, SOURCES_COLUMN)
