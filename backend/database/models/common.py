"""Mixins comunes para modelos persistidos en Postgres."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, func, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    """Clave primaria UUIDv7 generada por Postgres."""

    id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuidv7()"),
    )


class TimestampMixin:
    """Timestamps comunes gestionados por SQLAlchemy."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class SoftDeleteMixin:
    """Marca de borrado lógico para filas recuperables."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
