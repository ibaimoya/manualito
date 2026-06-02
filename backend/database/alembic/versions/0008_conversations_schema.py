"""Crea conversaciones y mensajes persistentes.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
GAMES_TABLE = "games"
CONVERSATIONS_TABLE = "conversations"
MESSAGES_TABLE = "messages"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
GAME_ID_COLUMN = "game_id"
CONVERSATION_ID_COLUMN = "conversation_id"
CREATED_AT_COLUMN = "created_at"
UPDATED_AT_COLUMN = "updated_at"
DELETED_AT_COLUMN = "deleted_at"

UUID_V7_DEFAULT = sa.text("uuidv7()")
CASCADE_ON_DELETE = "CASCADE"
RESTRICT_ON_DELETE = "RESTRICT"
MESSAGE_CONTENT_MAX_LENGTH = 12_000


def upgrade() -> None:
    """Crea el historial persistente de conversaciones por juego."""
    op.create_table(
        CONVERSATIONS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(GAME_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=80), nullable=True),
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
            name=op.f("ck_conversations_title_valid"),
        ),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_conversations_user_id_users"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.ForeignKeyConstraint(
            [GAME_ID_COLUMN],
            [f"{GAMES_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_conversations_game_id_games"),
            ondelete=RESTRICT_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_conversations")),
    )
    op.create_index("ix_conversations_user_id", CONVERSATIONS_TABLE, [USER_ID_COLUMN])
    op.create_index("ix_conversations_game_id", CONVERSATIONS_TABLE, [GAME_ID_COLUMN])
    op.create_index(
        "ix_conversations_user_game_updated",
        CONVERSATIONS_TABLE,
        [USER_ID_COLUMN, GAME_ID_COLUMN, sa.text("updated_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        MESSAGES_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(CONVERSATION_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
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
            "role IN ('user', 'assistant')",
            name=op.f("ck_messages_role_valid"),
        ),
        sa.CheckConstraint(
            "length(btrim(content)) > 0",
            name=op.f("ck_messages_content_not_empty"),
        ),
        sa.CheckConstraint(
            f"length(content) <= {MESSAGE_CONTENT_MAX_LENGTH}",
            name=op.f("ck_messages_content_length_valid"),
        ),
        sa.ForeignKeyConstraint(
            [CONVERSATION_ID_COLUMN],
            [f"{CONVERSATIONS_TABLE}.{ID_COLUMN}"],
            name=op.f("fk_messages_conversation_id_conversations"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f("pk_messages")),
    )
    op.create_index(
        "ix_messages_conversation_created",
        MESSAGES_TABLE,
        [CONVERSATION_ID_COLUMN, CREATED_AT_COLUMN, ID_COLUMN],
    )


def downgrade() -> None:
    """Elimina conversaciones y mensajes persistentes."""
    op.drop_index("ix_messages_conversation_created", table_name=MESSAGES_TABLE)
    op.drop_table(MESSAGES_TABLE)

    op.drop_index("ix_conversations_user_game_updated", table_name=CONVERSATIONS_TABLE)
    op.drop_index("ix_conversations_game_id", table_name=CONVERSATIONS_TABLE)
    op.drop_index("ix_conversations_user_id", table_name=CONVERSATIONS_TABLE)
    op.drop_table(CONVERSATIONS_TABLE)
