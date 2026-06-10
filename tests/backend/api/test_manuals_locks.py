from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

import api.locks as advisory_locks
import api.manuals.locks as manual_locks


@pytest.mark.anyio
async def test_manual_lock_yields_bound_session_and_unlocks(monkeypatch):
    """El lock vive en la conexion dedicada que se entrega a la sesion."""
    conn = _FakeConnection(acquired=True)
    session = object()
    session_factory = MagicMock(return_value=_AsyncContext(session))
    monkeypatch.setattr(advisory_locks, "get_engine", lambda: _FakeEngine(conn))
    monkeypatch.setattr(advisory_locks, "AsyncSession", session_factory)

    manual_id = uuid4()
    async with manual_locks.manual_lock(manual_id) as locked_session:
        assert locked_session is session

    assert conn.lock_params == {"key": f"manual:{manual_id}"}
    assert conn.unlock_params == {"key": f"manual:{manual_id}"}
    assert conn.commits == 2
    session_factory.assert_called_once_with(bind=conn, expire_on_commit=False)


@pytest.mark.anyio
async def test_manual_lock_yields_none_when_lock_is_busy(monkeypatch):
    """Si el manual ya está reclamado, no abre sesión ni ejecuta unlock."""
    conn = _FakeConnection(acquired=False)
    session_factory = MagicMock()
    monkeypatch.setattr(advisory_locks, "get_engine", lambda: _FakeEngine(conn))
    monkeypatch.setattr(advisory_locks, "AsyncSession", session_factory)

    async with manual_locks.manual_lock(uuid4()) as locked_session:
        assert locked_session is None

    assert conn.unlock_params is None
    assert conn.commits == 1
    session_factory.assert_not_called()


@pytest.mark.anyio
async def test_advisory_lock_rolls_back_open_transaction_before_unlock(monkeypatch):
    """Una transacción a medias se revierte antes de soltar el lock."""
    conn = _FakeConnection(acquired=True)
    conn.in_transaction = lambda: True
    rollbacks = []

    async def rollback():
        rollbacks.append(True)

    conn.rollback = rollback
    session_factory = MagicMock(return_value=_AsyncContext(object()))
    monkeypatch.setattr(advisory_locks, "get_engine", lambda: _FakeEngine(conn))
    monkeypatch.setattr(advisory_locks, "AsyncSession", session_factory)

    async with advisory_locks.advisory_session_lock("manual:abc"):
        pass

    assert rollbacks == [True]
    assert conn.unlock_params == {"key": "manual:abc"}


@pytest.mark.anyio
async def test_advisory_lock_namespaces_keys_per_resource(monkeypatch):
    """Claves distintas no comparten lock aunque acaben en el mismo recurso."""
    conn = _FakeConnection(acquired=True)
    session_factory = MagicMock(return_value=_AsyncContext(object()))
    monkeypatch.setattr(advisory_locks, "get_engine", lambda: _FakeEngine(conn))
    monkeypatch.setattr(advisory_locks, "AsyncSession", session_factory)

    async with advisory_locks.advisory_session_lock("explanation:user:game"):
        pass

    assert conn.lock_params == {"key": "explanation:user:game"}


class _FakeEngine:
    def __init__(self, conn):
        self._conn = conn

    def connect(self):
        return _AsyncContext(self._conn)


class _FakeConnection:
    def __init__(self, *, acquired: bool):
        self._acquired = acquired
        self.lock_params = None
        self.unlock_params = None
        self.commits = 0
        self.scalar = AsyncMock(side_effect=self._scalar)
        self.execute = AsyncMock(side_effect=self._execute)
        self.commit = AsyncMock(side_effect=self._commit)
        self.rollback = AsyncMock(side_effect=self._rollback)

    def _scalar(self, _stmt, params):
        self.lock_params = params
        return self._acquired

    def _execute(self, _stmt, params):
        self.unlock_params = params

    def _commit(self):
        self.commits += 1

    def _rollback(self):
        raise AssertionError("No deberia hacer rollback sin transaccion abierta")

    def in_transaction(self):
        return False


class _AsyncContext:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False
