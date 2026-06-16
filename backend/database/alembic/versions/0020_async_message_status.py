"""Añade estado asíncrono a los mensajes.

Revision ID: 0020
Revises: 0019
Create Date: 2026-06-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MESSAGES_TABLE = "messages"
ID_COLUMN = "id"
STATUS_COLUMN = "status"
ERROR_CODE_COLUMN = "error_code"
REPLY_TO_MESSAGE_ID_COLUMN = "reply_to_message_id"


def upgrade() -> None:
    """Permite asistentes pendientes o fallidos sin contenido final."""
    op.add_column(
        MESSAGES_TABLE,
        sa.Column(
            STATUS_COLUMN,
            sa.String(length=16),
            server_default=sa.text("'completed'"),
            nullable=False,
        ),
    )
    op.add_column(
        MESSAGES_TABLE,
        sa.Column(ERROR_CODE_COLUMN, sa.String(length=64), nullable=True),
    )
    op.add_column(
        MESSAGES_TABLE,
        sa.Column(
            REPLY_TO_MESSAGE_ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.drop_constraint(
        op.f("ck_messages_content_not_empty"),
        MESSAGES_TABLE,
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_messages_status_valid"),
        MESSAGES_TABLE,
        "status IN ('pending', 'completed', 'failed')",
    )
    op.create_check_constraint(
        op.f("ck_messages_user_messages_completed"),
        MESSAGES_TABLE,
        "role = 'assistant' OR status = 'completed'",
    )
    op.create_check_constraint(
        op.f("ck_messages_reply_only_for_assistant"),
        MESSAGES_TABLE,
        "role = 'assistant' OR reply_to_message_id IS NULL",
    )
    op.create_check_constraint(
        op.f("ck_messages_content_required_when_completed"),
        MESSAGES_TABLE,
        "(role = 'assistant' AND status IN ('pending', 'failed')) "
        "OR length(btrim(content)) > 0",
    )
    op.create_check_constraint(
        op.f("ck_messages_error_code_only_when_failed"),
        MESSAGES_TABLE,
        "error_code IS NULL OR status = 'failed'",
    )
    op.create_foreign_key(
        op.f("fk_messages_reply_to_message_id_messages"),
        MESSAGES_TABLE,
        MESSAGES_TABLE,
        [REPLY_TO_MESSAGE_ID_COLUMN],
        [ID_COLUMN],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_messages_reply_to_message_id",
        MESSAGES_TABLE,
        [REPLY_TO_MESSAGE_ID_COLUMN],
    )


def downgrade() -> None:
    """Recupera el contrato síncrono donde cualquier mensaje tenía contenido."""
    op.drop_index("ix_messages_reply_to_message_id", table_name=MESSAGES_TABLE)
    op.drop_constraint(
        op.f("fk_messages_reply_to_message_id_messages"),
        MESSAGES_TABLE,
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("ck_messages_error_code_only_when_failed"),
        MESSAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_messages_content_required_when_completed"),
        MESSAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_messages_reply_only_for_assistant"),
        MESSAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_messages_user_messages_completed"),
        MESSAGES_TABLE,
        type_="check",
    )
    op.drop_constraint(op.f("ck_messages_status_valid"), MESSAGES_TABLE, type_="check")
    op.create_check_constraint(
        op.f("ck_messages_content_not_empty"),
        MESSAGES_TABLE,
        "length(btrim(content)) > 0",
    )
    op.drop_column(MESSAGES_TABLE, REPLY_TO_MESSAGE_ID_COLUMN)
    op.drop_column(MESSAGES_TABLE, ERROR_CODE_COLUMN)
    op.drop_column(MESSAGES_TABLE, STATUS_COLUMN)
