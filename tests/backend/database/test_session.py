import asyncio
from secrets import token_urlsafe
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.engine import URL

import database.session as db_session


@pytest.fixture(autouse=True)
def reset_session_state():
    """Cada test empieza sin engine ni sessionmaker compartidos."""
    db_session._engine = None
    db_session._sessionmaker = None
    try:
        yield
    finally:
        db_session._engine = None
        db_session._sessionmaker = None


def test_get_engine_creates_async_engine_lazily(monkeypatch):
    """El engine se crea una vez y se reutiliza dentro del proceso."""
    engine = object()
    database_url = _test_database_url()
    create_async_engine = MagicMock(return_value=engine)
    get_database_url = MagicMock(return_value=database_url)
    monkeypatch.setattr(db_session, "create_async_engine", create_async_engine)
    monkeypatch.setattr(db_session, "get_database_url", get_database_url)

    assert db_session.get_engine() is engine
    assert db_session.get_engine() is engine

    get_database_url.assert_called_once_with()
    create_async_engine.assert_called_once_with(
        database_url,
        pool_pre_ping=True,
    )


def test_get_sessionmaker_creates_factory_lazily(monkeypatch):
    """La factory se crea una vez y produce sesiones independientes por llamada."""
    engine = object()
    factory = object()
    get_engine = MagicMock(return_value=engine)
    async_sessionmaker = MagicMock(return_value=factory)
    monkeypatch.setattr(db_session, "get_engine", get_engine)
    monkeypatch.setattr(db_session, "async_sessionmaker", async_sessionmaker)

    assert db_session.get_sessionmaker() is factory
    assert db_session.get_sessionmaker() is factory

    get_engine.assert_called_once_with()
    async_sessionmaker.assert_called_once_with(
        bind=engine,
        expire_on_commit=False,
    )


def test_get_db_session_yields_session_from_async_context(monkeypatch):
    """La dependency abre una sesión y la cierra al terminar la request."""
    session = object()
    session_context = _FakeSessionContext(session)
    sessionmaker = MagicMock(return_value=session_context)
    monkeypatch.setattr(db_session, "get_sessionmaker", MagicMock(return_value=sessionmaker))

    async def run_dependency():
        """Consume la dependency igual que lo haría FastAPI."""
        generator = db_session.get_db_session()
        yielded_session = await anext(generator)
        assert yielded_session is session
        assert session_context.entered is True
        assert session_context.exited is False
        with pytest.raises(StopAsyncIteration):
            await anext(generator)

    asyncio.run(run_dependency())

    sessionmaker.assert_called_once_with()
    assert session_context.exited is True


def test_dispose_engine_closes_pool_and_resets_state():
    """El cierre de la app libera el pool y limpia singletons perezosos."""
    engine = MagicMock()
    engine.dispose = AsyncMock()
    db_session._engine = engine
    db_session._sessionmaker = object()

    asyncio.run(db_session.dispose_engine())

    engine.dispose.assert_awaited_once_with()
    assert db_session._engine is None
    assert db_session._sessionmaker is None


def test_dispose_engine_resets_state_without_created_engine():
    """El cierre es inocuo si ninguna ruta ha creado todavía el engine."""
    db_session._sessionmaker = object()

    asyncio.run(db_session.dispose_engine())

    assert db_session._engine is None
    assert db_session._sessionmaker is None


class _FakeSessionContext:
    """Context manager async mínimo para probar la dependency."""

    def __init__(self, session: object) -> None:
        """Guarda la sesión falsa y banderas de entrada/salida."""
        self._session = session
        self.entered = False
        self.exited = False

    async def __aenter__(self) -> object:
        """Marca la entrada y devuelve la sesión falsa."""
        self.entered = True
        return self._session

    async def __aexit__(self, *_exc_info: object) -> None:
        """Marca la salida del contexto async."""
        self.exited = True


def _test_database_url() -> str:
    """Construye una URL de test con password generada al vuelo."""
    return URL.create(
        drivername="postgresql+psycopg",
        username="manualito",
        password=token_urlsafe(16),
        host="database",
        database="manualito",
    ).render_as_string(hide_password=False)
