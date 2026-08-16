"""Tests de la consulta de manuales autorizados contra un Postgres migrado."""

import asyncio
import os
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import uuid4

import anyio
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from api.manuals.repository import (
    list_alive_manual_ids,
    list_expected_chunk_ids,
    load_authorized_manual_ids,
)
from database.models.game import Game
from database.models.manual import Manual, ManualChunk
from database.models.user import User

DATABASE_URL = os.environ.get("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="Requiere un Postgres migrado accesible en DATABASE_URL.",
)

_CASOS_VISIBILIDAD = (
    ("ajeno_compartido_activo", "otro", "shared", "active", False, True),
    ("propio_privado_activo", "consultante", "private", "active", False, True),
    ("propio_privado_en_revision", "consultante", "private", "pending_review", False, True),
    ("propio_compartido_activo", "consultante", "shared", "active", False, True),
    ("ajeno_compartido_en_revision", "otro", "shared", "pending_review", False, False),
    ("ajeno_privado_activo", "otro", "private", "active", False, False),
    ("propio_privado_indexando", "consultante", "private", "indexing", False, False),
    ("propio_compartido_oculto", "consultante", "shared", "hidden", False, False),
    ("propio_privado_fallido", "consultante", "private", "failed", False, False),
    ("ajeno_compartido_activo_borrado", "otro", "shared", "active", True, False),
)

_CASOS_MANUALES_VIVOS = (
    ("indexando_vivo", "indexing", False, True),
    ("activo_vivo", "active", False, True),
    ("en_revision_vivo", "pending_review", False, True),
    ("oculto_vivo", "hidden", False, True),
    ("fallido_vivo", "failed", False, True),
    ("activo_borrado", "active", True, False),
)


@pytest.mark.parametrize(
    ("duenyo", "visibilidad", "estado", "borrado", "esperado"),
    [caso[1:] for caso in _CASOS_VISIBILIDAD],
    ids=[caso[0] for caso in _CASOS_VISIBILIDAD],
)
def test_manual_autorizado_segun_visibilidad(duenyo, visibilidad, estado, borrado, esperado):
    """Un manual entra en la lista solo si el usuario que consulta puede verlo."""

    async def caso(session: AsyncSession) -> None:
        consultante, otro, juego = await _siembra_base(session)
        manual = _manual(
            owner=consultante if duenyo == "consultante" else otro,
            game=juego,
            visibility=visibilidad,
            status=estado,
            borrado=borrado,
        )
        session.add(manual)
        await session.flush()

        ids = await load_authorized_manual_ids(
            session, game_id=juego.id, current_user_id=consultante.id
        )

        assert (manual.id in ids) == esperado

    _ejecuta(caso)


def test_manuales_de_otro_juego_quedan_fuera():
    """La lista se limita al juego consultado aunque haya manuales visibles en otros."""

    async def caso(session: AsyncSession) -> None:
        consultante, _, juego = await _siembra_base(session)
        otro_juego = _juego()
        session.add(otro_juego)
        await session.flush()
        session.add(
            _manual(owner=consultante, game=otro_juego, visibility="shared", status="active")
        )
        await session.flush()

        ids = await load_authorized_manual_ids(
            session, game_id=juego.id, current_user_id=consultante.id
        )

        assert ids == []

    _ejecuta(caso)


def test_ids_autorizados_ordenados_y_completos():
    """Con varios manuales visibles devuelve todos sus ids en orden estable."""

    async def caso(session: AsyncSession) -> None:
        consultante, otro, juego = await _siembra_base(session)
        visibles = [
            _manual(owner=consultante, game=juego, visibility="private", status="active"),
            _manual(owner=otro, game=juego, visibility="shared", status="active"),
            _manual(
                owner=consultante,
                game=juego,
                visibility="private",
                status="pending_review",
            ),
        ]
        session.add_all(visibles)
        session.add(_manual(owner=otro, game=juego, visibility="private", status="active"))
        await session.flush()

        ids = await load_authorized_manual_ids(
            session, game_id=juego.id, current_user_id=consultante.id
        )

        assert ids == sorted(manual.id for manual in visibles)

    _ejecuta(caso)


@pytest.mark.parametrize(
    ("estado", "borrado", "esperado"),
    [caso[1:] for caso in _CASOS_MANUALES_VIVOS],
    ids=[caso[0] for caso in _CASOS_MANUALES_VIVOS],
)
def test_ids_de_manuales_vivos_ignoran_el_estado(
    estado: str,
    borrado: bool,
    esperado: bool,
) -> None:
    """El inventario de Postgres incluye cualquier estado vivo y excluye borrados."""

    async def caso(session: AsyncSession) -> None:
        consultante, _, juego = await _siembra_base(session)
        manual = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status=estado,
            borrado=borrado,
        )
        session.add(manual)
        await session.flush()

        ids = await list_alive_manual_ids(session)

        assert (manual.id in ids) == esperado

    _ejecuta(caso)


def test_ids_de_chunks_esperados_se_agrupan_por_manual_indexable() -> None:
    """Los chunks esperados se agrupan solo para manuales vivos indexables."""

    async def caso(session: AsyncSession) -> None:
        consultante, _, juego = await _siembra_base(session)
        activo = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="active",
        )
        en_revision = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="pending_review",
        )
        oculto = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="hidden",
        )
        indexando = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="indexing",
        )
        fallido = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="failed",
        )
        borrado = _manual(
            owner=consultante,
            game=juego,
            visibility="private",
            status="active",
            borrado=True,
        )
        session.add_all(
            (
                activo,
                en_revision,
                oculto,
                indexando,
                fallido,
                borrado,
            )
        )
        await session.flush()

        chunks_activos = [
            _chunk(manual=activo, chunk_index=0),
            _chunk(manual=activo, chunk_index=1),
        ]
        chunk_en_revision = _chunk(manual=en_revision, chunk_index=0)
        chunk_oculto = _chunk(manual=oculto, chunk_index=0)
        chunk_indexando = _chunk(manual=indexando, chunk_index=0)
        chunk_fallido = _chunk(manual=fallido, chunk_index=0)
        chunk_borrado = _chunk(manual=borrado, chunk_index=0)
        session.add_all(
            (
                *chunks_activos,
                chunk_en_revision,
                chunk_oculto,
                chunk_indexando,
                chunk_fallido,
                chunk_borrado,
            )
        )
        await session.flush()

        ids = await list_expected_chunk_ids(session)

        assert ids == {
            activo.id: {chunk.id for chunk in chunks_activos},
            en_revision.id: {chunk_en_revision.id},
            oculto.id: {chunk_oculto.id},
        }

    _ejecuta(caso)


def _ejecuta(caso: Callable[[AsyncSession], Awaitable[None]]) -> None:
    """Ejecuta un caso contra Postgres y revierte su transacción al final.

    Usa un bucle de eventos Selector, que psycopg async exige en Windows.

    Args:
        caso (Callable[[AsyncSession], Awaitable[None]]): Caso que recibe la sesión.
    """

    async def con_sesion() -> None:
        engine = create_async_engine(DATABASE_URL)
        try:
            async with engine.connect() as connection:
                transaction = await connection.begin()
                session = AsyncSession(bind=connection, expire_on_commit=False)
                try:
                    await caso(session)
                finally:
                    await session.close()
                    await transaction.rollback()
        finally:
            await engine.dispose()

    anyio.run(con_sesion, backend_options={"loop_factory": asyncio.SelectorEventLoop})


async def _siembra_base(session: AsyncSession) -> tuple[User, User, Game]:
    """Inserta y devuelve los dos usuarios y el juego que comparten los casos.

    Args:
        session (AsyncSession): Sesión transaccional del test.

    Returns:
        tuple[User, User, Game]: Usuario que consulta, otro usuario y el juego.
    """
    consultante, otro, juego = _usuario(), _usuario(), _juego()
    session.add_all((consultante, otro, juego))
    await session.flush()
    return consultante, otro, juego


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


def _manual(
    *,
    owner: User,
    game: Game,
    visibility: str,
    status: str,
    borrado: bool = False,
) -> Manual:
    """Crea un manual con los campos que gobiernan su visibilidad.

    Args:
        owner (User): Propietario del manual.
        game (Game): Juego al que pertenece.
        visibility (str): Valor de visibilidad, shared o private.
        status (str): Estado del manual.
        borrado (bool): Si se marca con borrado lógico.

    Returns:
        Manual: Manual sin persistir listo para añadir a la sesión.
    """
    return Manual(
        owner_user_id=owner.id,
        game_id=game.id,
        source_type="images",
        page_count=1,
        status=status,
        visibility=visibility,
        deleted_at=datetime(2026, 8, 1, tzinfo=UTC) if borrado else None,
    )


def _chunk(*, manual: Manual, chunk_index: int) -> ManualChunk:
    """Crea un chunk mínimo asociado a un manual.

    Args:
        manual (Manual): Manual propietario del chunk.
        chunk_index (int): Posición única del chunk dentro del manual.

    Returns:
        ManualChunk: Chunk sin persistir listo para añadir a la sesión.
    """
    clave = uuid4().hex
    return ManualChunk(
        manual_id=manual.id,
        chunk_index=chunk_index,
        text=f"Contenido de prueba {clave}",
        source_page=1,
        content_hash=clave * 2,
    )
