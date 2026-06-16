"""Modelos de conversaciones y mensajes persistidos."""

from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base
from database.models.common import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from database.models.constants import CONVERSATION_TITLE_MAX_LENGTH, MESSAGE_CONTENT_MAX_LENGTH


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Conversación de un usuario sobre un juego concreto."""

    __tablename__ = "conversations"

    user_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("games.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(CONVERSATION_TITLE_MAX_LENGTH))

    __table_args__ = (
        CheckConstraint(
            "title IS NULL OR (length(btrim(title)) > 0 AND title = btrim(title))",
            name="title_valid",
        ),
        Index("ix_conversations_user_id", user_id),
        Index("ix_conversations_game_id", game_id),
        Index(
            "ix_conversations_user_game_updated",
            user_id,
            game_id,
            text("updated_at DESC"),
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )


class Message(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Mensaje individual dentro de una conversación."""

    __tablename__ = "messages"

    conversation_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=text("'completed'"),
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list[dict[str, object]]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    error_code: Mapped[str | None] = mapped_column(String(64))
    reply_to_message_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="SET NULL"),
    )

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="role_valid"),
        CheckConstraint(
            "status IN ('pending', 'completed', 'failed')",
            name="status_valid",
        ),
        CheckConstraint(
            "role = 'assistant' OR status = 'completed'",
            name="user_messages_completed",
        ),
        CheckConstraint(
            "role = 'assistant' OR reply_to_message_id IS NULL",
            name="reply_only_for_assistant",
        ),
        CheckConstraint(
            "(role = 'assistant' AND status IN ('pending', 'failed')) "
            "OR length(btrim(content)) > 0",
            name="content_required_when_completed",
        ),
        CheckConstraint(
            "error_code IS NULL OR status = 'failed'",
            name="error_code_only_when_failed",
        ),
        CheckConstraint("jsonb_typeof(sources) = 'array'", name="sources_array"),
        CheckConstraint(
            f"length(content) <= {MESSAGE_CONTENT_MAX_LENGTH}",
            name="content_length_valid",
        ),
        Index("ix_messages_conversation_created", conversation_id, "created_at", "id"),
        Index("ix_messages_reply_to_message_id", reply_to_message_id),
    )
