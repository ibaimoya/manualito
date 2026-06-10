"""Locks consultivos de Postgres para serializar trabajos por recurso."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database.session import get_engine

_LOCK_SQL = text("SELECT pg_try_advisory_lock(hashtextextended(:key, 0))")
_UNLOCK_SQL = text("SELECT pg_advisory_unlock(hashtextextended(:key, 0))")


@asynccontextmanager
async def advisory_session_lock(key: str) -> AsyncIterator[AsyncSession | None]:
    """Abre una sesión ligada a una conexión que mantiene el lock de la clave."""
    async with get_engine().connect() as conn:
        acquired = bool(await conn.scalar(_LOCK_SQL, {"key": key}))
        await conn.commit()
        if not acquired:
            yield None
            return

        try:
            async with AsyncSession(bind=conn, expire_on_commit=False) as session:
                yield session
        finally:
            if conn.in_transaction():
                await conn.rollback()
            await conn.execute(_UNLOCK_SQL, {"key": key})
            await conn.commit()
