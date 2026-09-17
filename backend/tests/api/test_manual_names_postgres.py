"""Pruebas de nombres y anonimato con PostgreSQL y la API reales.

MockTransport fija las respuestas de RAG y LLM para aislar la red. La
autenticación, la base de datos, los repositorios y los servicios son reales.
"""

import asyncio
import os
import selectors
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import UploadFile
from sqlalchemy import Row, delete, select, update
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.datastructures import Headers

import api.conversations.service as conversation_service
from api import config
from api.auth.service import AuthenticatedSession
from api.auth.tokens import generate_opaque_token, hash_token
from api.conversations.service import generate_pending_reply, list_messages
from api.games import explanations
from api.games.dto import GameExplanationJob
from api.games.repository import (
    get_explanation_pool,
    get_game_explanation,
    list_game_pool_manuals,
    save_game_explanation,
)
from api.main import app
from api.manuals.exceptions import ManualNotFoundError
from api.manuals.repository import get_readable_manual_detail, load_manual_source_info
from api.manuals.service import create_manual, delete_manual, update_manual
from api.rate_limit import limiter
from database.models.auth import AuthSession
from database.models.conversation import Conversation, Message
from database.models.explanation import GameExplanation
from database.models.game import Game
from database.models.manual import Manual, ManualChunk
from database.models.user import User
from database.session import dispose_engine, get_sessionmaker

_ANSWER = "Gana quien llegue a diez puntos."


@dataclass(slots=True)
class NamesWorld:
    sessions: async_sessionmaker[AsyncSession]
    owner: User
    reader: User
    game: Game
    user_ids: list[UUID] = field(default_factory=list)


@pytest.fixture
def anyio_backend():
    if os.name == "nt":
        return "asyncio", {
            "loop_factory": lambda: asyncio.SelectorEventLoop(selectors.SelectSelector())
        }
    return "asyncio"


@pytest.fixture
async def world(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[NamesWorld]:
    database_url = os.environ.get("DATABASE_URL")
    if database_url is None:
        if os.environ.get("CI") == "true":
            pytest.fail("CI debe proporcionar DATABASE_URL para estos contratos.")
        pytest.skip("Los contratos PostgreSQL requieren DATABASE_URL.")
    if make_url(database_url).database != "manualito_test":
        pytest.fail("Los contratos PostgreSQL exigen la base aislada manualito_test.")

    await dispose_engine()
    limiter.reset()
    monkeypatch.setattr(config, "ASSET_STORAGE_DIR", str(tmp_path / "assets"))
    sessions = get_sessionmaker()
    owner = _user("owner")
    reader = _user("reader")
    game = Game(name=f"Juego nombres {uuid4().hex[:8]}", name_key=uuid4().hex)
    async with sessions() as session:
        session.add_all((owner, reader, game))
        await session.commit()
    world = NamesWorld(sessions=sessions, owner=owner, reader=reader, game=game)
    world.user_ids = [owner.id, reader.id]
    try:
        yield world
    finally:
        async with sessions() as session:
            await session.execute(
                delete(Message).where(
                    Message.conversation_id.in_(
                        select(Conversation.id).where(Conversation.game_id == game.id)
                    )
                )
            )
            await session.execute(delete(Conversation).where(Conversation.game_id == game.id))
            await session.execute(delete(GameExplanation).where(GameExplanation.game_id == game.id))
            await session.execute(delete(Manual).where(Manual.game_id == game.id))
            await session.execute(delete(Game).where(Game.id == game.id))
            await session.execute(delete(User).where(User.id.in_(world.user_ids)))
            await session.commit()
        await dispose_engine()


@pytest.mark.anyio
async def test_manuales_existentes_y_nuevos_nacen_anonimos(world: NamesWorld, valid_jpeg_bytes):
    async with world.sessions() as session:
        legacy = Manual(
            owner_user_id=world.owner.id,
            game_id=world.game.id,
            visibility="shared",
            status="active",
        )
        session.add(legacy)
        await session.commit()
        legacy_id = legacy.id

    async with world.sessions() as session:
        created = await create_manual(
            session,
            auth=_auth(world.owner),
            game_id=world.game.id,
            title="Subido sin indicar nada",
            visibility="shared",
            language=None,
            images=[_image_upload(valid_jpeg_bytes)],
            pdf=None,
        )

    async with world.sessions() as session:
        legacy_flag = await session.scalar(select(Manual.anonymous).where(Manual.id == legacy_id))
        detail = await get_readable_manual_detail(
            session, current_user_id=world.owner.id, manual_id=created.manual_id
        )

    assert legacy_flag is True
    assert detail.anonymous is True


@pytest.mark.anyio
async def test_subida_con_opt_in_solo_cuenta_si_es_compartido(world: NamesWorld, valid_jpeg_bytes):
    async with world.sessions() as session:
        shared = await create_manual(
            session,
            auth=_auth(world.owner),
            game_id=world.game.id,
            title="Compartido con nombre",
            visibility="shared",
            language=None,
            images=[_image_upload(valid_jpeg_bytes)],
            pdf=None,
            anonymous=False,
        )
    async with world.sessions() as session:
        private = await create_manual(
            session,
            auth=_auth(world.owner),
            game_id=world.game.id,
            title="Privado que pide nombre",
            visibility="private",
            language=None,
            images=[_image_upload(_tweak(valid_jpeg_bytes))],
            pdf=None,
            anonymous=False,
        )

    async with world.sessions() as session:
        flags = dict(
            (
                await session.execute(
                    select(Manual.id, Manual.anonymous).where(
                        Manual.id.in_([shared.manual_id, private.manual_id])
                    )
                )
            ).all()
        )

    assert flags[shared.manual_id] is False
    assert flags[private.manual_id] is True


@pytest.mark.anyio
async def test_propietario_cambia_solo_nombre_o_solo_anonimato(world: NamesWorld):
    manual = await _seed_manual(world, title="Título inicial", visibility="shared")
    async with world.sessions() as session:
        pool_before = await get_explanation_pool(
            session, game_id=world.game.id, current_user_id=world.owner.id
        )

    async with world.sessions() as session:
        renamed = await update_manual(
            session, auth=_auth(world.owner), manual_id=manual.id, title="Título nuevo"
        )
    async with world.sessions() as session:
        attributed = await update_manual(
            session, auth=_auth(world.owner), manual_id=manual.id, anonymous=False
        )

    async with world.sessions() as session:
        row = (
            await session.execute(
                select(Manual.title, Manual.anonymous, Manual.status, Manual.indexed_at).where(
                    Manual.id == manual.id
                )
            )
        ).one()
        pool_after = await get_explanation_pool(
            session, game_id=world.game.id, current_user_id=world.owner.id
        )

    assert (renamed.title, renamed.anonymous) == ("Título nuevo", True)
    assert (attributed.title, attributed.anonymous) == ("Título nuevo", False)
    assert (row.title, row.anonymous, row.status) == ("Título nuevo", False, "active")
    assert row.indexed_at == manual.indexed_at
    assert pool_before is not None
    assert pool_after is not None
    assert pool_after.source_fingerprint == pool_before.source_fingerprint


@pytest.mark.anyio
async def test_manual_privado_sigue_anonimo_aunque_se_pida_lo_contrario(world: NamesWorld):
    manual = await _seed_manual(world, title="Privado", visibility="private")

    async with world.sessions() as session:
        summary = await update_manual(
            session,
            auth=_auth(world.owner),
            manual_id=manual.id,
            title="Privado renombrado",
            anonymous=False,
        )

    assert summary.title == "Privado renombrado"
    assert summary.anonymous is True


@pytest.mark.anyio
async def test_ajeno_y_borrado_no_se_pueden_editar(world: NamesWorld):
    manual = await _seed_manual(world, title="Del propietario", visibility="shared")
    reader = _auth(world.reader)
    owner = _auth(world.owner)

    async with world.sessions() as session:
        with pytest.raises(ManualNotFoundError):
            await update_manual(session, auth=reader, manual_id=manual.id, title="Robado")

    async with world.sessions() as session:
        await delete_manual(session, auth=_auth(world.owner), manual_id=manual.id)
    async with world.sessions() as session:
        with pytest.raises(ManualNotFoundError):
            await update_manual(session, auth=owner, manual_id=manual.id, anonymous=False)

    async with world.sessions() as session:
        title = await session.scalar(select(Manual.title).where(Manual.id == manual.id))
    assert title == "Del propietario"


@pytest.mark.anyio
async def test_patch_http_recorta_el_titulo_y_guarda_solo_el_campo_enviado(world: NamesWorld):
    manual = await _seed_manual(world, title="Título inicial", visibility="shared")

    async with await _authed_client(world, world.owner) as client:
        renamed = await client.patch(
            f"/api/manuals/{manual.id}", json={"title": "  Reglas definitivas  "}
        )
        attributed = await client.patch(f"/api/manuals/{manual.id}", json={"anonymous": False})

    assert renamed.status_code == 200
    assert (renamed.json()["title"], renamed.json()["anonymous"]) == ("Reglas definitivas", True)
    assert attributed.status_code == 200
    body = attributed.json()
    assert (body["id"], body["title"], body["anonymous"]) == (
        str(manual.id),
        "Reglas definitivas",
        False,
    )
    row = await _manual_row(world, manual.id)
    assert (row.title, row.anonymous, row.status) == ("Reglas definitivas", False, "active")
    assert row.indexed_at == manual.indexed_at


@pytest.mark.anyio
async def test_patch_http_ajeno_o_borrado_devuelve_404(world: NamesWorld):
    manual = await _seed_manual(world, title="Del propietario", visibility="shared")

    async with await _authed_client(world, world.reader) as reader:
        foreign = await reader.patch(f"/api/manuals/{manual.id}", json={"title": "Robado"})
    async with world.sessions() as session:
        await delete_manual(session, auth=_auth(world.owner), manual_id=manual.id)
    async with await _authed_client(world, world.owner) as owner:
        gone = await owner.patch(f"/api/manuals/{manual.id}", json={"anonymous": False})

    assert foreign.status_code == gone.status_code == 404
    assert _has_error(foreign.json(), field=None, code="manual_not_found")
    assert _has_error(gone.json(), field=None, code="manual_not_found")
    row = await _manual_row(world, manual.id)
    assert (row.title, row.anonymous) == ("Del propietario", True)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("payload", "field", "code"),
    [
        ({}, None, "invalid_request_body"),
        ({"title": None}, "title", "invalid_request"),
        ({"anonymous": None}, "anonymous", "invalid_request"),
        ({"anonymous": "true"}, "anonymous", "invalid_request"),
        ({"anonymous": 1}, "anonymous", "invalid_request"),
        ({"title": "   "}, "title", "title_required"),
        ({"title": "x" * 256}, "title", "title_too_long"),
        ({"title": "Ok", "visibility": "shared"}, "visibility", "unexpected_field"),
    ],
)
async def test_patch_http_rechaza_cuerpos_invalidos_sin_tocar_el_manual(
    world: NamesWorld, payload: dict[str, object], field: str | None, code: str
):
    manual = await _seed_manual(world, title="Intacto", visibility="shared")

    async with await _authed_client(world, world.owner) as client:
        response = await client.patch(f"/api/manuals/{manual.id}", json=payload)

    assert response.status_code == 422
    assert _has_error(response.json(), field=field, code=code)
    row = await _manual_row(world, manual.id)
    assert (row.title, row.anonymous) == ("Intacto", True)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("with_cookies", "csrf_header", "status", "code"),
    [
        (False, None, 401, "authentication_required"),
        (True, None, 403, "invalid_csrf_token"),
        (True, "csrf-ajeno", 403, "invalid_csrf_token"),
    ],
)
async def test_patch_http_exige_sesion_y_csrf_validos(
    world: NamesWorld, with_cookies: bool, csrf_header: str | None, status: int, code: str
):
    manual = await _seed_manual(world, title="Protegido", visibility="shared")
    session_token, csrf_token = await _seed_auth_session(world, world.owner)
    cookies = _auth_cookies(session_token, csrf_token) if with_cookies else {}
    headers = {config.AUTH_CSRF_HEADER_NAME: csrf_header} if csrf_header else {}

    async with _asgi_client(cookies=cookies, headers=headers) as client:
        response = await client.patch(f"/api/manuals/{manual.id}", json={"title": "Robado"})

    assert response.status_code == status
    assert _has_error(response.json(), field=None, code=code)
    row = await _manual_row(world, manual.id)
    assert (row.title, row.anonymous) == ("Protegido", True)


@pytest.mark.anyio
async def test_pool_expone_username_solo_con_permiso_y_manual_compartido(world: NamesWorld):
    shared = await _seed_manual(world, title="Compartido", visibility="shared", anonymous=False)
    private = await _seed_manual(world, title="Privado", visibility="private", anonymous=False)

    async with world.sessions() as session:
        as_reader = {
            item.id: item.author_name
            for item in await list_game_pool_manuals(
                session, game_id=world.game.id, current_user_id=world.reader.id
            )
        }
        as_owner = {
            item.id: item.author_name
            for item in await list_game_pool_manuals(
                session, game_id=world.game.id, current_user_id=world.owner.id
            )
        }

    assert as_reader == {shared.id: world.owner.username}
    assert as_owner == {shared.id: world.owner.username, private.id: None}


@pytest.mark.anyio
async def test_propietario_desactivado_o_borrado_pierde_la_atribucion(world: NamesWorld):
    shared = await _seed_manual(world, title="Compartido", visibility="shared", anonymous=False)

    async with world.sessions() as session:
        await session.execute(
            update(User).where(User.id == world.owner.id).values(status="disabled")
        )
        await session.commit()
        pool = await list_game_pool_manuals(
            session, game_id=world.game.id, current_user_id=world.reader.id
        )

    assert [item.author_name for item in pool if item.id == shared.id] == [None]


@pytest.mark.anyio
async def test_fuentes_antiguas_siguen_al_manual_y_al_username(world: NamesWorld):
    manual = await _seed_manual(world, title="Título viejo", visibility="shared", anonymous=False)
    conversation_id = await _seed_conversation_with_sources(
        world,
        user=world.reader,
        sources=[_source(manual.id, "Título viejo", page=3)],
    )

    first = await _read_sources(world, world.reader, conversation_id)
    async with world.sessions() as session:
        await update_manual(
            session, auth=_auth(world.owner), manual_id=manual.id, title="Título actual"
        )
    async with world.sessions() as session:
        await session.execute(
            update(User).where(User.id == world.owner.id).values(username="nuevo_nombre")
        )
        await session.commit()
    renamed = await _read_sources(world, world.reader, conversation_id)
    async with world.sessions() as session:
        await update_manual(session, auth=_auth(world.owner), manual_id=manual.id, anonymous=True)
    withdrawn = await _read_sources(world, world.reader, conversation_id)

    assert first == [(manual.id, "Título viejo", 3, world.owner.username)]
    assert renamed == [(manual.id, "Título actual", 3, "nuevo_nombre")]
    assert withdrawn == [(manual.id, "Título actual", 3, None)]


@pytest.mark.anyio
async def test_manual_inaccesible_conserva_titulo_historico_sin_atribucion(world: NamesWorld):
    manual = await _seed_manual(
        world, title="Cuando era público", visibility="shared", anonymous=False
    )
    conversation_id = await _seed_conversation_with_sources(
        world,
        user=world.reader,
        sources=[_source(manual.id, "Cuando era público", page=1)],
    )

    async with world.sessions() as session:
        await session.execute(
            update(Manual)
            .where(Manual.id == manual.id)
            .values(visibility="private", title="Secreto actual")
        )
        await session.commit()
    hidden = await _read_sources(world, world.reader, conversation_id)

    async with world.sessions() as session:
        await session.execute(
            update(Manual).where(Manual.id == manual.id).values(visibility="shared")
        )
        await session.commit()
    async with world.sessions() as session:
        await delete_manual(session, auth=_auth(world.owner), manual_id=manual.id)
    deleted = await _read_sources(world, world.reader, conversation_id)

    assert hidden == [(manual.id, "Cuando era público", 1, None)]
    assert deleted == [(manual.id, "Cuando era público", 1, None)]


@pytest.mark.anyio
async def test_dos_manuales_en_la_misma_pagina_se_resuelven_por_separado(world: NamesWorld):
    first = await _seed_manual(world, title="Primero", visibility="shared", anonymous=False)
    second = await _seed_manual(world, title="Segundo", visibility="shared", anonymous=True)
    conversation_id = await _seed_conversation_with_sources(
        world,
        user=world.reader,
        sources=[_source(second.id, "Segundo", page=2), _source(first.id, "Primero", page=2)],
    )

    async with world.sessions() as session:
        await update_manual(
            session, auth=_auth(world.owner), manual_id=first.id, title="Primero v2"
        )
    sources = await _read_sources(world, world.reader, conversation_id)

    assert sources == [
        (second.id, "Segundo", 2, None),
        (first.id, "Primero v2", 2, world.owner.username),
    ]


@pytest.mark.anyio
async def test_valor_historico_de_author_name_se_sustituye_al_leer(world: NamesWorld):
    manual = await _seed_manual(world, title="Manual", visibility="shared", anonymous=True)
    conversation_id = await _seed_conversation_with_sources(
        world,
        user=world.reader,
        sources=[{**_source(manual.id, "Manual", page=1), "author_name": "nombre_filtrado"}],
    )

    sources = await _read_sources(world, world.reader, conversation_id)

    assert sources == [(manual.id, "Manual", 1, None)]


@pytest.mark.anyio
async def test_la_respuesta_generada_no_persiste_el_username(world: NamesWorld, monkeypatch):
    manual = await _seed_manual(world, title="Con autor", visibility="shared", anonymous=False)
    chunk_id = await _seed_chunk(world, manual.id, page=4)
    turno = await _seed_pending_turn(world, user=world.reader)
    _mock_external_http(
        monkeypatch,
        conversation_service.httpx,
        retrieve=lambda: [str(chunk_id)],
    )

    completed = await generate_pending_reply(
        world.reader.id, turno["conversation_id"], turno["user_id_msg"], turno["assistant"], 3, "es"
    )

    async with world.sessions() as session:
        stored = await session.scalar(
            select(Message.sources).where(Message.id == turno["assistant"])
        )
    shown = await _read_sources(world, world.reader, turno["conversation_id"])
    assert completed is True
    assert stored == [
        {"manual_id": str(manual.id), "manual_title": "Con autor", "page": 4, "is_own": False}
    ]
    assert shown == [(manual.id, "Con autor", 4, world.owner.username)]


@pytest.mark.anyio
async def test_explicacion_cacheada_muestra_titulo_y_autor_vigentes(world: NamesWorld):
    manual = await _seed_manual(world, title="Guía", visibility="shared", anonymous=False)
    async with world.sessions() as session:
        pool = await get_explanation_pool(
            session, game_id=world.game.id, current_user_id=world.reader.id
        )
        assert pool is not None
        await save_game_explanation(
            session,
            game_id=world.game.id,
            source_fingerprint=pool.source_fingerprint,
            sections={
                "summary": {
                    "answer": "Resumen",
                    "sources": [
                        {"manual_id": str(manual.id), "manual_title": "Guía", "page": 2},
                    ],
                }
            },
            status="ready",
        )

    async with world.sessions() as session:
        await update_manual(
            session, auth=_auth(world.owner), manual_id=manual.id, title="Guía revisada"
        )

    async with world.sessions() as session:
        snapshot = await get_game_explanation(
            session, game_id=world.game.id, source_fingerprint=pool.source_fingerprint
        )
        assert snapshot is not None
        for_reader = await explanations.build_game_explanation_response(
            session,
            current_user_id=world.reader.id,
            snapshot=snapshot,
            owned_manual_ids=frozenset(),
        )
        for_owner = await explanations.build_game_explanation_response(
            session,
            current_user_id=world.owner.id,
            snapshot=snapshot,
            owned_manual_ids=frozenset({manual.id}),
        )
        pool_after = await get_explanation_pool(
            session, game_id=world.game.id, current_user_id=world.reader.id
        )

    assert for_reader.sections is not None
    assert for_owner.sections is not None
    reader_source = for_reader.sections["summary"].sources[0]
    owner_source = for_owner.sections["summary"].sources[0]
    assert (reader_source.manual_title, reader_source.author_name, reader_source.is_own) == (
        "Guía revisada",
        world.owner.username,
        False,
    )
    assert (owner_source.manual_title, owner_source.author_name, owner_source.is_own) == (
        "Guía revisada",
        world.owner.username,
        True,
    )
    assert pool_after is not None
    assert pool_after.source_fingerprint == pool.source_fingerprint
    assert snapshot.sections["summary"]["sources"][0] == {
        "manual_id": str(manual.id),
        "manual_title": "Guía",
        "page": 2,
    }


@pytest.mark.anyio
async def test_la_explicacion_generada_no_persiste_el_username(world: NamesWorld, monkeypatch):
    manual = await _seed_manual(world, title="Guía", visibility="shared", anonymous=False)
    chunk_id = await _seed_chunk(world, manual.id, page=1)
    _mock_external_http(monkeypatch, explanations.httpx, retrieve=lambda: [str(chunk_id)])
    async with world.sessions() as session:
        pool = await get_explanation_pool(
            session, game_id=world.game.id, current_user_id=world.reader.id
        )
        assert pool is not None
        await save_game_explanation(
            session,
            game_id=world.game.id,
            source_fingerprint=pool.source_fingerprint,
            sections={},
            status="generating",
        )

    job = GameExplanationJob(world.reader.id, world.game.id, pool.source_fingerprint)
    generated = await explanations.generate_game_explanation(
        job.user_id, job.game_id, job.source_fingerprint
    )
    assert generated is True

    async with world.sessions() as session:
        snapshot = await get_game_explanation(
            session, game_id=world.game.id, source_fingerprint=pool.source_fingerprint
        )
    assert snapshot is not None
    assert snapshot.status == "ready"
    for section in snapshot.sections.values():
        assert isinstance(section, dict)
        assert section["sources"] == [
            {"manual_id": str(manual.id), "manual_title": "Guía", "page": 1}
        ]


@pytest.mark.anyio
async def test_lote_solo_devuelve_manuales_accesibles(world: NamesWorld):
    shared = await _seed_manual(world, title="Compartido", visibility="shared", anonymous=False)
    private = await _seed_manual(world, title="Privado", visibility="private", anonymous=False)
    gone = await _seed_manual(world, title="Borrado", visibility="shared", anonymous=False)
    async with world.sessions() as session:
        await delete_manual(session, auth=_auth(world.owner), manual_id=gone.id)

    async with world.sessions() as session:
        for_reader = await load_manual_source_info(
            session,
            current_user_id=world.reader.id,
            manual_ids=[shared.id, private.id, gone.id, uuid4()],
        )
        for_owner = await load_manual_source_info(
            session, current_user_id=world.owner.id, manual_ids=[shared.id, private.id, gone.id]
        )

    assert {key: (info.title, info.author_name) for key, info in for_reader.items()} == {
        shared.id: ("Compartido", world.owner.username)
    }
    assert {key: (info.title, info.author_name) for key, info in for_owner.items()} == {
        shared.id: ("Compartido", world.owner.username),
        private.id: ("Privado", None),
    }


def _user(prefix: str) -> User:
    key = f"{prefix}_{uuid4().hex[:12]}"
    return User(
        email=f"{key}@tests.local",
        password_hash="hash-de-pruebas",
        username=key,
        username_key=key,
    )


def _auth(user: User) -> AuthenticatedSession:
    return AuthenticatedSession(
        user=user,
        auth_session=AuthSession(
            user_id=user.id,
            token_hash="a" * 64,
            csrf_token_hash="b" * 64,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        ),
        session_token="session-token",
        csrf_token="csrf-token",
    )


async def _seed_auth_session(world: NamesWorld, user: User) -> tuple[str, str]:
    session_token = generate_opaque_token()
    csrf_token = generate_opaque_token()
    async with world.sessions() as session:
        session.add(
            AuthSession(
                user_id=user.id,
                token_hash=hash_token(session_token),
                csrf_token_hash=hash_token(csrf_token),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await session.commit()
    return session_token, csrf_token


def _auth_cookies(session_token: str, csrf_token: str) -> dict[str, str]:
    return {
        config.AUTH_SESSION_COOKIE_NAME: session_token,
        config.AUTH_CSRF_COOKIE_NAME: csrf_token,
    }


def _asgi_client(*, cookies: dict[str, str], headers: dict[str, str]) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        cookies=cookies,
        headers=headers,
    )


async def _authed_client(world: NamesWorld, user: User) -> httpx.AsyncClient:
    session_token, csrf_token = await _seed_auth_session(world, user)
    return _asgi_client(
        cookies=_auth_cookies(session_token, csrf_token),
        headers={config.AUTH_CSRF_HEADER_NAME: csrf_token},
    )


async def _manual_row(world: NamesWorld, manual_id: UUID) -> Row[Any]:
    async with world.sessions() as session:
        result = await session.execute(
            select(Manual.title, Manual.anonymous, Manual.status, Manual.indexed_at).where(
                Manual.id == manual_id
            )
        )
        return result.one()


def _has_error(body: dict[str, Any], *, field: str | None, code: str) -> bool:
    return any(error["field"] == field and error["code"] == code for error in body["errors"])


def _image_upload(content: bytes) -> UploadFile:
    return UploadFile(
        BytesIO(content),
        filename="pagina.jpg",
        size=len(content),
        headers=Headers({"content-type": "image/jpeg"}),
    )


def _source(manual_id: UUID, title: str, *, page: int) -> dict[str, object]:
    return {"manual_id": str(manual_id), "manual_title": title, "page": page, "is_own": False}


def _tweak(jpeg: bytes) -> bytes:
    return jpeg + b"\x00"


async def _seed_manual(
    world: NamesWorld, *, title: str, visibility: str, anonymous: bool = True
) -> Manual:
    async with world.sessions() as session:
        manual = Manual(
            owner_user_id=world.owner.id,
            game_id=world.game.id,
            title=title,
            visibility=visibility,
            anonymous=anonymous,
            status="active",
            chunks_indexed=1,
            indexed_at=datetime.now(UTC),
        )
        session.add(manual)
        await session.commit()
        return manual


async def _seed_chunk(world: NamesWorld, manual_id: UUID, *, page: int) -> UUID:
    async with world.sessions() as session:
        chunk = ManualChunk(
            manual_id=manual_id,
            chunk_index=page,
            text=f"Texto de la página {page}.",
            source_page=page,
            content_hash=uuid4().hex * 2,
        )
        session.add(chunk)
        await session.commit()
        return chunk.id


async def _seed_conversation_with_sources(
    world: NamesWorld, *, user: User, sources: list[dict[str, object]]
) -> UUID:
    async with world.sessions() as session:
        conversation = Conversation(user_id=user.id, game_id=world.game.id)
        session.add(conversation)
        await session.flush()
        question = Message(
            conversation_id=conversation.id,
            role="user",
            status="completed",
            content="¿Cómo se gana?",
        )
        session.add(question)
        await session.flush()
        session.add(
            Message(
                conversation_id=conversation.id,
                role="assistant",
                status="completed",
                content=_ANSWER,
                sources=sources,
                reply_to_message_id=question.id,
            )
        )
        await session.commit()
        return conversation.id


async def _seed_pending_turn(world: NamesWorld, *, user: User) -> dict[str, UUID]:
    async with world.sessions() as session:
        conversation = Conversation(user_id=user.id, game_id=world.game.id)
        session.add(conversation)
        await session.flush()
        question = Message(
            conversation_id=conversation.id,
            role="user",
            status="completed",
            content="¿Cómo se gana?",
        )
        session.add(question)
        await session.flush()
        assistant = Message(
            conversation_id=conversation.id,
            role="assistant",
            status="pending",
            content="",
            reply_to_message_id=question.id,
        )
        session.add(assistant)
        await session.commit()
        return {
            "conversation_id": conversation.id,
            "user_id_msg": question.id,
            "assistant": assistant.id,
        }


async def _read_sources(
    world: NamesWorld, user: User, conversation_id: UUID
) -> list[tuple[UUID, str | None, int, str | None]]:
    async with world.sessions() as session:
        messages = await list_messages(
            session,
            current_user_id=user.id,
            conversation_id=conversation_id,
            limit=10,
            offset=0,
        )
    return [
        (source.manual_id, source.manual_title, source.page, source.author_name)
        for message in messages
        if message.role == "assistant"
        for source in message.sources
    ]


def _mock_external_http(monkeypatch: pytest.MonkeyPatch, httpx_module, *, retrieve) -> None:

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/retrieve":
            return httpx.Response(200, json={"chunks": [{"id": value} for value in retrieve()]})
        if request.url.path == "/condense-question":
            return httpx.Response(404, json={"detail": "sin reformulación"})
        return httpx.Response(200, json={"answer": _ANSWER})

    real_client = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx_module, "AsyncClient", client)
