"""Esquema de identidad, sesiones, auditoría y assets.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USERS_TABLE = "users"
AUTH_SESSIONS_TABLE = "auth_sessions"
ASSETS_TABLE = "assets"
AUDIT_LOG_TABLE = "audit_log"

ID_COLUMN = "id"
USER_ID_COLUMN = "user_id"
OWNER_USER_ID_COLUMN = "owner_user_id"
CREATED_AT_COLUMN = "created_at"
UPDATED_AT_COLUMN = "updated_at"
DELETED_AT_COLUMN = "deleted_at"

UUID_V7_DEFAULT = sa.text("uuidv7()")
ACTIVE_ROW_FILTER = sa.text("deleted_at IS NULL")


def upgrade() -> None:
    """Crea identidad, sesiones, auditoría y assets."""
    op.create_table(
        USERS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("username_key", sa.String(length=160), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "role",
            sa.String(length=16),
            server_default=sa.text("'user'"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
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
            "length(btrim(username)) > 0",
            name=op.f("ck_users_username_not_empty"),
        ),
        sa.CheckConstraint(
            "username = btrim(username)",
            name=op.f("ck_users_username_trimmed"),
        ),
        sa.CheckConstraint(
            "position('@' in username) = 0",
            name=op.f("ck_users_username_without_at"),
        ),
        sa.CheckConstraint(
            "length(username_key) > 0",
            name=op.f("ck_users_username_key_not_empty"),
        ),
        sa.CheckConstraint("role IN ('user', 'admin')", name=op.f("ck_users_role_valid")),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'deleted')",
            name=op.f("ck_users_status_valid"),
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN),
    )
    op.create_index(
        "uq_users_email_active",
        USERS_TABLE,
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=ACTIVE_ROW_FILTER,
    )
    op.create_index(
        "uq_users_username_key_active",
        USERS_TABLE,
        ["username_key"],
        unique=True,
        postgresql_where=ACTIVE_ROW_FILTER,
    )

    op.create_table(
        AUTH_SESSIONS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN),
    )
    op.create_index(
        "uq_auth_sessions_token_hash",
        AUTH_SESSIONS_TABLE,
        ["token_hash"],
        unique=True,
    )
    op.create_index("ix_auth_sessions_user_id", AUTH_SESSIONS_TABLE, [USER_ID_COLUMN])
    op.create_index("ix_auth_sessions_expires_at", AUTH_SESSIONS_TABLE, ["expires_at"])

    op.create_table(
        ASSETS_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(OWNER_USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
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
            "kind IN ('avatar', 'manual_page_image')",
            name=op.f("ck_assets_kind_valid"),
        ),
        sa.CheckConstraint("byte_size > 0", name=op.f("ck_assets_byte_size_positive")),
        sa.CheckConstraint("length(sha256) = 64", name=op.f("ck_assets_sha256_length_valid")),
        sa.CheckConstraint("width IS NULL OR width > 0", name=op.f("ck_assets_width_positive")),
        sa.CheckConstraint("height IS NULL OR height > 0", name=op.f("ck_assets_height_positive")),
        sa.ForeignKeyConstraint(
            [OWNER_USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN),
    )
    op.create_index("ix_assets_owner_user_id", ASSETS_TABLE, [OWNER_USER_ID_COLUMN])
    op.create_index("ix_assets_kind", ASSETS_TABLE, ["kind"])
    op.create_index(
        "uq_assets_owner_avatar_active",
        ASSETS_TABLE,
        [OWNER_USER_ID_COLUMN],
        unique=True,
        postgresql_where=sa.text("kind = 'avatar' AND deleted_at IS NULL"),
    )

    op.create_table(
        AUDIT_LOG_TABLE,
        sa.Column(
            ID_COLUMN,
            postgresql.UUID(as_uuid=True),
            server_default=UUID_V7_DEFAULT,
            nullable=False,
        ),
        sa.Column(USER_ID_COLUMN, postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column(
            "event_data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            CREATED_AT_COLUMN,
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "length(event_type) > 0",
            name=op.f("ck_audit_log_event_type_not_empty"),
        ),
        sa.ForeignKeyConstraint(
            [USER_ID_COLUMN],
            [f"{USERS_TABLE}.{ID_COLUMN}"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(ID_COLUMN),
    )
    op.create_index("ix_audit_log_user_id", AUDIT_LOG_TABLE, [USER_ID_COLUMN])
    op.create_index("ix_audit_log_created_at", AUDIT_LOG_TABLE, [CREATED_AT_COLUMN])


def downgrade() -> None:
    """Elimina identidad, sesiones, auditoría y assets."""
    op.drop_index("ix_audit_log_created_at", table_name=AUDIT_LOG_TABLE)
    op.drop_index("ix_audit_log_user_id", table_name=AUDIT_LOG_TABLE)
    op.drop_table(AUDIT_LOG_TABLE)

    op.drop_index("uq_assets_owner_avatar_active", table_name=ASSETS_TABLE)
    op.drop_index("ix_assets_kind", table_name=ASSETS_TABLE)
    op.drop_index("ix_assets_owner_user_id", table_name=ASSETS_TABLE)
    op.drop_table(ASSETS_TABLE)

    op.drop_index("ix_auth_sessions_expires_at", table_name=AUTH_SESSIONS_TABLE)
    op.drop_index("ix_auth_sessions_user_id", table_name=AUTH_SESSIONS_TABLE)
    op.drop_index("uq_auth_sessions_token_hash", table_name=AUTH_SESSIONS_TABLE)
    op.drop_table(AUTH_SESSIONS_TABLE)

    op.drop_index("uq_users_username_key_active", table_name=USERS_TABLE)
    op.drop_index("uq_users_email_active", table_name=USERS_TABLE)
    op.drop_table(USERS_TABLE)
