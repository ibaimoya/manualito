"""Añade verificación de email y reset de contraseña.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
EMAIL_VERIFICATION_TOKENS_TABLE = "email_verification_tokens"
PASSWORD_RESET_TOKENS_TABLE = "password_reset_tokens"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
TOKEN_HASH_COLUMN = "token_hash"
CREATED_AT_COLUMN = "created_at"
EXPIRES_AT_COLUMN = "expires_at"
CONSUMED_AT_COLUMN = "consumed_at"
EMAIL_VERIFIED_AT_COLUMN = "email_verified_at"

UUID_V7_DEFAULT = sa.text("uuidv7()")
CASCADE_ON_DELETE = "CASCADE"
SHA256_HEX_LENGTH = 64


def upgrade() -> None:
    """Crea tokens opacos de cuenta y marca soft de email verificado."""
    op.add_column(
        USERS_TABLE,
        sa.Column(EMAIL_VERIFIED_AT_COLUMN, sa.DateTime(timezone=True), nullable=True),
    )
    _create_account_token_table(EMAIL_VERIFICATION_TOKENS_TABLE)
    _create_account_token_table(PASSWORD_RESET_TOKENS_TABLE)


def downgrade() -> None:
    """Elimina tokens opacos de cuenta y marca de email verificado."""
    _drop_account_token_table(PASSWORD_RESET_TOKENS_TABLE)
    _drop_account_token_table(EMAIL_VERIFICATION_TOKENS_TABLE)
    op.drop_column(USERS_TABLE, EMAIL_VERIFIED_AT_COLUMN)


def _create_account_token_table(table_name: str) -> None:
    """Crea una tabla de tokens hasheados ligada a usuarios."""
    op.create_table(
        table_name,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(TOKEN_HASH_COLUMN, sa.String(length=SHA256_HEX_LENGTH), nullable=False),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(EXPIRES_AT_COLUMN, sa.DateTime(timezone=True), nullable=False),
        sa.Column(CONSUMED_AT_COLUMN, sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            f"length({TOKEN_HASH_COLUMN}) = {SHA256_HEX_LENGTH}",
            name=op.f(f"ck_{table_name}_token_hash_length_valid"),
        ),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            name=op.f(f"fk_{table_name}_user_id_users"),
            ondelete=CASCADE_ON_DELETE,
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN, name=op.f(f"pk_{table_name}")),
    )
    op.create_index(f"uq_{table_name}_token_hash", table_name, [TOKEN_HASH_COLUMN], unique=True)
    op.create_index(f"ix_{table_name}_user_id", table_name, [USER_ID_COLUMN])
    op.create_index(f"ix_{table_name}_expires_at", table_name, [EXPIRES_AT_COLUMN])


def _drop_account_token_table(table_name: str) -> None:
    """Elimina índices y tabla de tokens de cuenta."""
    op.drop_index(f"ix_{table_name}_expires_at", table_name=table_name)
    op.drop_index(f"ix_{table_name}_user_id", table_name=table_name)
    op.drop_index(f"uq_{table_name}_token_hash", table_name=table_name)
    op.drop_table(table_name)
