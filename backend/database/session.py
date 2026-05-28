from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from database.config import get_database_url

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Crea perezosamente el engine async compartido del proceso."""
    global _engine
    engine = _engine
    if engine is None:
        engine = create_async_engine(get_database_url(), pool_pre_ping=True)
        _engine = engine
    return engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Devuelve la factoría de sesiones async, sin compartir sesiones."""
    global _sessionmaker
    sessionmaker = _sessionmaker
    if sessionmaker is None:
        sessionmaker = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
        )
        _sessionmaker = sessionmaker
    return sessionmaker


async def get_db_session() -> AsyncIterator[AsyncSession]:
    """Dependency FastAPI: una sesión por request."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session


async def dispose_engine() -> None:
    """Cierra el pool de conexiones al parar el proceso."""
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None
