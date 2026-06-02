"""Modelo de usuario y restricciones de identidad."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import (
    EMAIL_MAX_LENGTH,
    USERNAME_KEY_MAX_LENGTH,
    USERNAME_MAX_LENGTH,
)


class User(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Usuario autenticable de Manualito."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(EMAIL_MAX_LENGTH), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    username: Mapped[str] = mapped_column(String(USERNAME_MAX_LENGTH), nullable=False)
    username_key: Mapped[str] = mapped_column(String(USERNAME_KEY_MAX_LENGTH), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'user'"),
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'active'"),
    )

    __table_args__ = (
        CheckConstraint("length(btrim(username)) > 0", name="username_not_empty"),
        CheckConstraint("username = btrim(username)", name="username_trimmed"),
        CheckConstraint("position('@' in username) = 0", name="username_without_at"),
        CheckConstraint("length(username_key) > 0", name="username_key_not_empty"),
        CheckConstraint("role IN ('user', 'admin')", name="role_valid"),
        CheckConstraint(
            "status IN ('active', 'disabled', 'deleted')",
            name="status_valid",
        ),
        Index(
            "uq_users_username_key_active",
            username_key,
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_users_email_active",
            func.lower(email),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )
