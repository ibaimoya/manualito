"""Lock exclusivo por manual para su procesamiento."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from api.locks import advisory_session_lock


@asynccontextmanager
async def manual_lock(manual_id: UUID) -> AsyncIterator[AsyncSession | None]:
    """Serializa el procesamiento de un manual concreto."""
    async with advisory_session_lock(f"manual:{manual_id}") as session:
        yield session
