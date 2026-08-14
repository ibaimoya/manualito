"""Tests de los turnos de chat contra Postgres real y respuestas HTTP simuladas."""

import asyncio
import json
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

import anyio
import httpx
import pytest
from sqlalchemy import delete, select
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
        async with _turno_sembrado(con_chunk=True) as turno:

            def _red(request: httpx.Request) -> httpx.Response:
                if request.url.path == "/retrieve":
                    return httpx.Response(
                        200, json={"chunks": [{"id": str(turno["chunk_id"])}]}
                    )
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
        async with _turno_sembrado(con_chunk=False) as turno:

            def _red(request: httpx.Request) -> httpx.Response:
                return httpx.Response(404, json={"detail": "Contexto no encontrado."})

            _simula_red(monkeypatch, _red)
            completado = await _genera_respuesta(turno)

            mensaje = await _mensaje_asistente(turno)
            assert completado is True
            assert (mensaje.status, mensaje.error_code) == ("failed", "generation_failed")

    _ejecuta(caso)


def test_un_chunk_ajeno_privado_deja_el_mensaje_fallido(monkeypatch):
    """Si RAG devuelve el chunk privado de otro usuario, la respuesta acaba en error."""

    async def caso() -> None:
        async with _turno_sembrado(con_chunk=False, con_chunk_ajeno=True) as turno:

            def _red(request: httpx.Request) -> httpx.Response:
                if request.url.path == "/retrieve":
                    return httpx.Response(
                        200, json={"chunks": [{"id": str(turno["chunk_ajeno_id"])}]}
                    )
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
        async with _turno_sembrado(con_chunk=True) as turno:

            def _red(request: httpx.Request) -> httpx.Response:
                if request.url.path == "/retrieve":
                    return httpx.Response(
                        200, json={"chunks": [{"id": str(turno["chunk_id"])}]}
                    )
                raise RuntimeError("fallo imprevisto en la generación")

            _simula_red(monkeypatch, _red)
            completado = await _genera_respuesta(turno)

            mensaje = await _mensaje_asistente(turno)
            assert completado is True
            assert (mensaje.status, mensaje.error_code) == ("failed", "generation_failed")

    _ejecuta(caso)


@pytest.mark.parametrize("averia", ("404", "500", "desconexion"))
def test_reformulacion_fallida_usa_la_pregunta_original(monkeypatch, averia):
    """Si el condense falla de cualquier forma, se busca con la pregunta original."""

    async def caso() -> None:
        async with _turno_sembrado(con_chunk=True, con_historial=True) as turno:
            preguntas_buscadas: list[str] = []

            def _red(request: httpx.Request) -> httpx.Response:
                if request.url.path == "/condense-question":
                    if averia == "desconexion":
                        raise httpx.ConnectError("Ollama caído")
                    return httpx.Response(int(averia), json={"detail": "avería simulada"})
                if request.url.path == "/retrieve":
                    cuerpo = json.loads(request.content)
                    preguntas_buscadas.append(cuerpo["question"])
                    return httpx.Response(
                        200, json={"chunks": [{"id": str(turno["chunk_id"])}]}
                    )
                return httpx.Response(200, json={"answer": _RESPUESTA})

            _simula_red(monkeypatch, _red)
            completado = await _genera_respuesta(turno)

            mensaje = await _mensaje_asistente(turno)
            assert completado is True
            assert (mensaje.status, mensaje.content) == ("completed", _RESPUESTA)
            assert preguntas_buscadas == ["¿Cómo se gana?"]

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


@asynccontextmanager
async def _turno_sembrado(
    *,
    con_chunk: bool,
    con_historial: bool = False,
    con_chunk_ajeno: bool = False,
) -> AsyncIterator[dict[str, UUID]]:
    """Siembra un turno pendiente y borra sus filas al terminar el caso.

    Args:
        con_chunk (bool): Si se crea un manual del propio usuario con un chunk.
        con_historial (bool): Si se añade un turno anterior ya completado.
        con_chunk_ajeno (bool): Si se crea el manual privado de otro usuario.

    Yields:
        dict[str, UUID]: Identificadores del turno sembrado.
    """
    turno = await _siembra_turno(
        con_chunk=con_chunk,
        con_historial=con_historial,
        con_chunk_ajeno=con_chunk_ajeno,
    )
    try:
        yield turno
    finally:
        await _limpia_turno(turno)


async def _siembra_turno(
    *,
    con_chunk: bool,
    con_historial: bool,
    con_chunk_ajeno: bool,
) -> dict[str, UUID]:
    """Persiste un turno de chat pendiente con sus filas mínimas reales.

    Args:
        con_chunk (bool): Si se crea un manual del propio usuario con un chunk.
        con_historial (bool): Si se añade un turno anterior ya completado.
        con_chunk_ajeno (bool): Si se crea el manual privado de otro usuario.

    Returns:
        dict[str, UUID]: Ids de usuario, juego, conversación, mensajes y chunks.
    """
    engine = create_async_engine(DATABASE_URL)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            usuario = _usuario()
            juego = _juego()
            session.add_all((usuario, juego))
            await session.flush()
            user_ids = [usuario.id]

            chunk_id: UUID | None = None
            if con_chunk:
                chunk_id = await _siembra_manual(
                    session, owner_id=usuario.id, game_id=juego.id
                )
            chunk_ajeno_id: UUID | None = None
            if con_chunk_ajeno:
                otro = _usuario()
                session.add(otro)
                await session.flush()
                user_ids.append(otro.id)
                chunk_ajeno_id = await _siembra_manual(
                    session, owner_id=otro.id, game_id=juego.id
                )

            conversacion = Conversation(user_id=usuario.id, game_id=juego.id)
            session.add(conversacion)
            await session.flush()
            if con_historial:
                pregunta_previa = Message(
                    conversation_id=conversacion.id,
                    role="user",
                    status="completed",
                    content="¿Cuántos dados se usan?",
                )
                session.add(pregunta_previa)
                await session.flush()
                session.add(
                    Message(
                        conversation_id=conversacion.id,
                        role="assistant",
                        status="completed",
                        content="Se usan dos dados.",
                        reply_to_message_id=pregunta_previa.id,
                    )
                )
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
                "user_ids": user_ids,
                "game_id": juego.id,
                "conversation_id": conversacion.id,
                "user_message_id": mensaje_usuario.id,
                "assistant_message_id": asistente.id,
                "chunk_id": chunk_id or uuid4(),
                "chunk_ajeno_id": chunk_ajeno_id or uuid4(),
            }
    finally:
        await engine.dispose()


async def _siembra_manual(session: AsyncSession, *, owner_id: UUID, game_id: UUID) -> UUID:
    """Persiste un manual privado activo con un único chunk.

    Args:
        session (AsyncSession): Sesión de siembra abierta.
        owner_id (UUID): Propietario del manual.
        game_id (UUID): Juego al que pertenece.

    Returns:
        UUID: Id del chunk creado.
    """
    manual = Manual(
        owner_user_id=owner_id,
        game_id=game_id,
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
    return chunk.id


async def _limpia_turno(turno: dict[str, UUID]) -> None:
    """Borra del Postgres de pruebas todas las filas sembradas para el turno.

    Args:
        turno (dict[str, UUID]): Identificadores devueltos por la siembra.
    """
    engine = create_async_engine(DATABASE_URL)
    try:
        async with AsyncSession(engine) as session:
            await session.execute(
                delete(Message).where(Message.conversation_id == turno["conversation_id"])
            )
            await session.execute(
                delete(Conversation).where(Conversation.id == turno["conversation_id"])
            )
            await session.execute(delete(Manual).where(Manual.game_id == turno["game_id"]))
            await session.execute(delete(Game).where(Game.id == turno["game_id"]))
            await session.execute(delete(User).where(User.id.in_(turno["user_ids"])))
            await session.commit()
    finally:
        await engine.dispose()


def _usuario() -> User:
    """Crea un usuario mínimo que cumple las restricciones de la tabla.

    Returns:
        User: Usuario sin persistir con identificadores únicos.
    """
    clave = uuid4().hex[:16]
    return User(
        email=f"{clave}@tests.local",
        password_hash="hash-de-pruebas",
        username=clave,
        username_key=clave,
    )


def _juego() -> Game:
    """Crea un juego mínimo que cumple las restricciones de la tabla.

    Returns:
        Game: Juego sin persistir con nombre único.
    """
    clave = uuid4().hex[:16]
    return Game(name=f"Juego {clave}", name_key=clave)
