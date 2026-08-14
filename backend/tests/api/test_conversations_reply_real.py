"""Tests del turno de chat contra Postgres real, con la red simulada en la frontera."""

import asyncio
import os
from collections.abc import Awaitable, Callable
from uuid import UUID, uuid4

import anyio
import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import api.conversations.service as conversation_service
from database.models.conversation import Conversation, Message
from database.models.game import Game
from database.models.manual import Manual, ManualChunk
from database.models.user import User

DATABASE_URL = os.environ.get("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="Requiere un Postgres migrado accesible en DATABASE_URL.",
)

_RESPUESTA = "Se gana con diez puntos."


def test_turno_completo_deja_el_mensaje_respondido(monkeypatch):
    """Con RAG y LLM sanos, el mensaje del asistente termina completado."""

    async def caso() -> None:
        turno = await _siembra_turno(con_chunk=True)

        def _red(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/retrieve":
                return httpx.Response(200, json={"chunks": [{"id": str(turno["chunk_id"])}]})
            return httpx.Response(200, json={"answer": _RESPUESTA})

        _simula_red(monkeypatch, _red)
        completado = await _genera_respuesta(turno)

        mensaje = await _mensaje_asistente(turno)
        assert completado is True
        assert (mensaje.status, mensaje.content) == ("completed", _RESPUESTA)

    _ejecuta(caso)


def test_un_404_interno_deja_el_mensaje_fallido(monkeypatch):
    """Un 404 de un servicio interno no puede dejar la respuesta pendiente."""

    async def caso() -> None:
        turno = await _siembra_turno(con_chunk=False)

        def _red(request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"detail": "Contexto no encontrado."})

        _simula_red(monkeypatch, _red)
        completado = await _genera_respuesta(turno)

        mensaje = await _mensaje_asistente(turno)
        assert completado is True
        assert (mensaje.status, mensaje.error_code) == ("failed", "generation_failed")

    _ejecuta(caso)


def test_sin_chunks_autorizados_el_mensaje_queda_fallido(monkeypatch):
    """Si RAG devuelve ids que Postgres no autoriza, la respuesta acaba en error."""

    async def caso() -> None:
        turno = await _siembra_turno(con_chunk=False)

        def _red(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/retrieve":
                return httpx.Response(200, json={"chunks": [{"id": str(uuid4())}]})
            return httpx.Response(200, json={"answer": _RESPUESTA})

        _simula_red(monkeypatch, _red)
        completado = await _genera_respuesta(turno)

        mensaje = await _mensaje_asistente(turno)
        assert completado is True
        assert (mensaje.status, mensaje.error_code) == ("failed", "generation_failed")

    _ejecuta(caso)


def test_un_error_imprevisto_deja_el_mensaje_fallido(monkeypatch):
    """Una excepción no contemplada tampoco puede dejar la respuesta pendiente."""

    async def caso() -> None:
        turno = await _siembra_turno(con_chunk=True)

        def _red(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/retrieve":
                return httpx.Response(200, json={"chunks": [{"id": str(turno["chunk_id"])}]})
            raise RuntimeError("fallo imprevisto en la generación")

        _simula_red(monkeypatch, _red)
        completado = await _genera_respuesta(turno)

        mensaje = await _mensaje_asistente(turno)
        assert completado is True
        assert (mensaje.status, mensaje.error_code) == ("failed", "generation_failed")

    _ejecuta(caso)


def _ejecuta(caso: Callable[[], Awaitable[None]]) -> None:
    """Ejecuta un caso con un bucle de eventos Selector, que psycopg async exige en Windows.

    Args:
        caso (Callable[[], Awaitable[None]]): Corrutina con el escenario completo.
    """
    anyio.run(caso, backend_options={"loop_factory": asyncio.SelectorEventLoop})


def _simula_red(monkeypatch: pytest.MonkeyPatch, handler: Callable) -> None:
    """Sustituye la red saliente del servicio por un transporte simulado.

    Args:
        monkeypatch (pytest.MonkeyPatch): Fixture de parcheo del test.
        handler (Callable): Respuesta simulada para cada petición HTTP.
    """
    real_async_client = httpx.AsyncClient

    def _cliente(**kwargs: object) -> httpx.AsyncClient:
        return real_async_client(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(conversation_service.httpx, "AsyncClient", _cliente)


async def _genera_respuesta(turno: dict[str, UUID]) -> bool:
    """Lanza la generación pendiente del turno sembrado.

    Args:
        turno (dict[str, UUID]): Identificadores devueltos por la siembra.

    Returns:
        bool: Resultado de generate_pending_reply.
    """
    return await conversation_service.generate_pending_reply(
        turno["user_id"],
        turno["conversation_id"],
        turno["user_message_id"],
        turno["assistant_message_id"],
        3,
        "es",
    )


async def _mensaje_asistente(turno: dict[str, UUID]) -> Message:
    """Relee el mensaje del asistente desde una sesión nueva.

    Args:
        turno (dict[str, UUID]): Identificadores devueltos por la siembra.

    Returns:
        Message: Fila actual del mensaje del asistente.
    """
    engine = create_async_engine(DATABASE_URL)
    try:
        async with AsyncSession(engine) as session:
            result = await session.execute(
                select(Message).where(Message.id == turno["assistant_message_id"])
            )
            return result.scalar_one()
    finally:
        await engine.dispose()


async def _siembra_turno(*, con_chunk: bool) -> dict[str, UUID]:
    """Persiste un turno de chat pendiente con sus filas mínimas reales.

    Args:
        con_chunk (bool): Si se crea también un manual activo con un chunk.

    Returns:
        dict[str, UUID]: Ids de usuario, conversación, mensajes y chunk opcional.
    """
    engine = create_async_engine(DATABASE_URL)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            clave = uuid4().hex[:16]
            usuario = User(
                email=f"{clave}@tests.local",
                password_hash="hash-de-pruebas",
                username=clave,
                username_key=clave,
            )
            juego = Game(name=f"Juego {clave}", name_key=clave)
            session.add_all((usuario, juego))
            await session.flush()

            chunk_id: UUID | None = None
            if con_chunk:
                manual = Manual(
                    owner_user_id=usuario.id,
                    game_id=juego.id,
                    source_type="images",
                    page_count=1,
                    status="active",
                    visibility="private",
                )
                session.add(manual)
                await session.flush()
                chunk = ManualChunk(
                    manual_id=manual.id,
                    chunk_index=0,
                    text="Gana la primera persona que consiga diez puntos.",
                    source_page=1,
                    content_hash="a" * 64,
                )
                session.add(chunk)
                await session.flush()
                chunk_id = chunk.id

            conversacion = Conversation(user_id=usuario.id, game_id=juego.id)
            session.add(conversacion)
            await session.flush()
            mensaje_usuario = Message(
                conversation_id=conversacion.id,
                role="user",
                status="completed",
                content="¿Cómo se gana?",
            )
            session.add(mensaje_usuario)
            await session.flush()
            asistente = Message(
                conversation_id=conversacion.id,
                role="assistant",
                status="pending",
                content="",
                reply_to_message_id=mensaje_usuario.id,
            )
            session.add(asistente)
            await session.commit()

            return {
                "user_id": usuario.id,
                "conversation_id": conversacion.id,
                "user_message_id": mensaje_usuario.id,
                "assistant_message_id": asistente.id,
                "chunk_id": chunk_id or uuid4(),
            }
    finally:
        await engine.dispose()
