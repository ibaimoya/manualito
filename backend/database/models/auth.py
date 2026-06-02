"""Modelos de sesión de autenticación y tokens de cuenta."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import UUIDPrimaryKeyMixin
from database.models.constants import SHA256_HEX_LENGTH

USER_ID_FK_TARGET = "users.id"
CASCADE_ON_DELETE = "CASCADE"


class AuthSession(UUIDPrimaryKeyMixin, Base):
    """Sesión persistida asociada a una cookie opaca."""

    __tablename__ = "auth_sessions"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(USER_ID_FK_TARGET, ondelete=CASCADE_ON_DELETE),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    csrf_token_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("uq_auth_sessions_token_hash", token_hash, unique=True),
        Index("ix_auth_sessions_user_id", user_id),
        Index("ix_auth_sessions_expires_at", expires_at),
    )


class EmailVerificationToken(UUIDPrimaryKeyMixin, Base):
    """Token opaco para marcar el email como verificado de forma soft."""

    __tablename__ = "email_verification_tokens"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(USER_ID_FK_TARGET, ondelete=CASCADE_ON_DELETE),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(SHA256_HEX_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            f"length(token_hash) = {SHA256_HEX_LENGTH}",
            name="token_hash_length_valid",
        ),
        Index("uq_email_verification_tokens_token_hash", token_hash, unique=True),
        Index("ix_email_verification_tokens_user_id", user_id),
        Index("ix_email_verification_tokens_expires_at", expires_at),
    )


class PasswordResetToken(UUIDPrimaryKeyMixin, Base):
    """Token opaco de un solo uso para restablecer contraseña."""

    __tablename__ = "password_reset_tokens"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(USER_ID_FK_TARGET, ondelete=CASCADE_ON_DELETE),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(SHA256_HEX_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            f"length(token_hash) = {SHA256_HEX_LENGTH}",
            name="token_hash_length_valid",
        ),
        Index("uq_password_reset_tokens_token_hash", token_hash, unique=True),
        Index("ix_password_reset_tokens_user_id", user_id),
        Index("ix_password_reset_tokens_expires_at", expires_at),
    )
