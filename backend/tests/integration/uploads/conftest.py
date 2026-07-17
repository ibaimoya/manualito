from __future__ import annotations

import asyncio
import os
import shutil
import sys
from collections import deque
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from itertools import count
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import Engine, create_engine, delete, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from api import config
from api.auth.passwords import hash_password
from api.main import app
from api.manuals import service as manuals_service
from database.config import get_database_url
from database.models.audit import AuditLog
from database.models.game import Game
from database.models.user import User

_TEST_CLIENT_IPS = count(10)


@dataclass(frozen=True, slots=True)
class UploadRuntime:
    """Servicios y directorios reales reservados para esta suite."""

    asset_root: Path
    spool_dir: Path
    storage_started_empty: bool


@dataclass(frozen=True, slots=True)
class UploadIdentity:
    """Credenciales de una identidad sembrada en PostgreSQL."""

    user_id: UUID
    email: str
    username: str


@dataclass(frozen=True, slots=True)
class UploadWorld:
    """Datos de dominio aislados que una prueba puede usar y eliminar."""

    users: tuple[UploadIdentity, UploadIdentity]
    game_ids: tuple[UUID, UUID]
    password: str


@dataclass(frozen=True, slots=True)
class UploadAuth:
    """Cookies y cabecera CSRF emitidas por el login real."""

    cookies: dict[str, str]
    csrf_token: str

    @property
    def headers(self) -> dict[str, str]:
        return {config.AUTH_CSRF_HEADER_NAME: self.csrf_token}


@dataclass(slots=True)
class InternalServiceProbe:
    """Frontera HTTP determinista para observar OCR/RAG sin simular dominio."""

    ocr_responses: deque[tuple[int, dict[str, object]]] = field(default_factory=deque)
    ocr_requests: list[dict[str, object]] = field(default_factory=list)
    rag_ingests: list[dict[str, object]] = field(default_factory=list)
    rag_deletes: list[dict[str, object]] = field(default_factory=list)
    app: FastAPI = field(init=False)

    def __post_init__(self) -> None:
        self.app = FastAPI()
        self.app.add_api_route("/extract", self._extract, methods=["POST"])
        self.app.add_api_route("/ingest", self._ingest, methods=["POST"])
        self.app.add_api_route("/delete", self._delete, methods=["POST"])

    async def _extract(self, request: Request) -> JSONResponse:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
        self.ocr_requests.append(
            {
                "body": bytes(body),
                "content_type": request.headers.get("content-type"),
                "content_length": request.headers.get("content-length"),
            }
        )
        if not self.ocr_responses:
            raise AssertionError("El pipeline llamó a OCR sin respuesta preparada")
        status_code, payload = self.ocr_responses.popleft()
        return JSONResponse(status_code=status_code, content=payload)

    async def _ingest(self, request: Request) -> JSONResponse:
        payload = await self._json_object(request)
        self.rag_ingests.append(payload)
        chunks = payload.get("chunks")
        if not isinstance(chunks, list):
            raise AssertionError("RAG recibió chunks con un contrato inválido")
        chunk_ids = [
            str(chunk["id"]) for chunk in chunks if isinstance(chunk, dict) and "id" in chunk
        ]
        if len(chunk_ids) != len(chunks):
            raise AssertionError("RAG recibió un chunk sin identificador")
        return JSONResponse(
            content={
                "chunk_ids": chunk_ids,
                "chunks_indexed": len(chunk_ids),
                "embedding_model": "integration-test-model",
                "indexed_at": "2026-01-01T00:00:00+00:00",
            }
        )

    async def _delete(self, request: Request) -> JSONResponse:
        self.rag_deletes.append(await self._json_object(request))
        return JSONResponse(content={})

    @staticmethod
    async def _json_object(request: Request) -> dict[str, object]:
        payload: Any = await request.json()
        if not isinstance(payload, dict):
            raise AssertionError("El servicio interno recibió un JSON no objeto")
        return payload

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app))


@pytest.fixture(scope="session")
def upload_db_engine() -> Iterator[Engine]:
    """Conecta al PostgreSQL de integración o explica por qué la suite se omite."""
    try:
        database_url = get_database_url()
    except (OSError, RuntimeError) as exc:
        pytest.skip(f"PostgreSQL de integración no está configurado: {exc}")

    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 2},
    )
    try:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except OperationalError as exc:
            pytest.skip(f"PostgreSQL de integración no está disponible: {exc}")
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def upload_runtime(upload_db_engine: Engine) -> UploadRuntime:
    """Exige Redis y un volumen real, privado y escribible antes de probar subidas."""
    del upload_db_engine
    try:
        redis = Redis.from_url(
            config.CELERY_BROKER_URL,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        try:
            redis.ping()
        finally:
            redis.close()
    except (OSError, RedisError, RuntimeError) as exc:
        pytest.skip(f"Redis de integración no está disponible: {exc}")

    asset_root = Path(config.ASSET_STORAGE_DIR).resolve()
    spool_value = os.environ.get("TMPDIR")
    if spool_value is None:
        pytest.skip("TMPDIR no apunta al spool aislado de la integración de subidas")
    spool_dir = Path(spool_value).resolve()
    if not asset_root.is_dir() or not spool_dir.is_dir():
        pytest.skip("El volumen de assets y su spool aislado deben existir antes de la suite")
    if spool_dir.parent != asset_root:
        pytest.fail("TMPDIR debe estar dentro de ASSET_STORAGE_DIR")

    probe = asset_root / f".integration-write-probe-{uuid4().hex}"
    try:
        probe.touch(mode=0o600, exist_ok=False)
    except OSError as exc:
        pytest.fail(f"El volumen de assets no es escribible: {exc}")
    finally:
        probe.unlink(missing_ok=True)

    manuals_root = asset_root / "manuals"
    storage_started_empty = not manuals_root.exists() or not any(manuals_root.iterdir())
    return UploadRuntime(
        asset_root=asset_root,
        spool_dir=spool_dir,
        storage_started_empty=storage_started_empty,
    )


@pytest.fixture
def upload_world(
    upload_db_engine: Engine,
    upload_runtime: UploadRuntime,
) -> Iterator[UploadWorld]:
    """Siembra dos usuarios y dos juegos, y limpia únicamente sus filas y rutas."""
    token = uuid4().hex
    password = "manualito-integration-password"
    password_hash = hash_password(password)
    with Session(upload_db_engine, expire_on_commit=False) as session:
        users = [
            User(
                email=f"upload-{index}-{token}@example.test",
                username=f"u{index}_{token[:16]}",
                username_key=f"u{index}_{token[:16]}",
                password_hash=password_hash,
                role="user",
                status="active",
            )
            for index in range(2)
        ]
        session.add_all(users)
        session.flush()
        games = [
            Game(
                name=f"Upload integration {index} {token}",
                name_key=f"upload integration {index} {token}",
                status="active",
                created_by_user_id=users[0].id,
            )
            for index in range(2)
        ]
        session.add_all(games)
        session.commit()
        world = UploadWorld(
            users=tuple(
                UploadIdentity(
                    user_id=user.id,
                    email=user.email,
                    username=user.username,
                )
                for user in users
            ),
            game_ids=(games[0].id, games[1].id),
            password=password,
        )

    try:
        yield world
    finally:
        user_ids = tuple(identity.user_id for identity in world.users)
        with Session(upload_db_engine) as session:
            session.execute(delete(AuditLog).where(AuditLog.user_id.in_(user_ids)))
            session.execute(delete(User).where(User.id.in_(user_ids)))
            session.execute(delete(Game).where(Game.id.in_(world.game_ids)))
            session.commit()
        for user_id in user_ids:
            shutil.rmtree(
                upload_runtime.asset_root / "manuals" / str(user_id),
                ignore_errors=True,
            )


@pytest.fixture
def upload_client(upload_runtime: UploadRuntime) -> Iterator[TestClient]:
    """Arranca el lifespan real y conserva cookies Secure gracias al origen HTTPS."""
    del upload_runtime
    backend_options = (
        {"loop_factory": asyncio.SelectorEventLoop} if sys.platform == "win32" else None
    )
    with TestClient(
        app,
        base_url="https://testserver",
        backend_options=backend_options,
        client=(f"127.0.0.{next(_TEST_CLIENT_IPS)}", 50000),
    ) as client:
        yield client


@pytest.fixture
def upload_authenticator() -> Callable[[TestClient, UploadIdentity, str], UploadAuth]:
    """Inicia sesión por la API pública y devuelve cookies reutilizables."""

    def authenticate(
        client: TestClient,
        identity: UploadIdentity,
        password: str,
    ) -> UploadAuth:
        client.cookies.clear()
        response = client.post(
            "/api/auth/login",
            json={"identifier": identity.email, "password": password},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        session_cookie = response.cookies.get(config.AUTH_SESSION_COOKIE_NAME)
        csrf_cookie = response.cookies.get(config.AUTH_CSRF_COOKIE_NAME)
        assert session_cookie is not None
        assert csrf_cookie == body["csrf_token"]
        return UploadAuth(
            cookies={
                config.AUTH_SESSION_COOKIE_NAME: session_cookie,
                config.AUTH_CSRF_COOKIE_NAME: csrf_cookie,
            },
            csrf_token=body["csrf_token"],
        )

    return authenticate


@pytest.fixture
def captured_manual_dispatches(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Captura solo la frontera Celery: el job no ejecuta workers consumidores."""
    dispatched: list[str] = []
    monkeypatch.setattr(
        "api.manuals.router.process_manual_task.delay",
        lambda manual_id: dispatched.append(manual_id),
    )
    return dispatched


@pytest.fixture
def internal_service_probe(monkeypatch: pytest.MonkeyPatch) -> InternalServiceProbe:
    """Sustituye solo la red externa por un servidor ASGI determinista."""
    probe = InternalServiceProbe()
    monkeypatch.setattr(manuals_service, "_internal_http_client", probe.client)
    return probe
