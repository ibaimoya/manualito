"""Casos de uso del catálogo de juegos."""

import asyncio
import logging
import unicodedata
from uuid import UUID
from weakref import WeakValueDictionary

import httpx
from sqlalchemy.engine import Row
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.auth.service import AuthenticatedSession
from api.games import repository
from api.games.bgg import fetch_board_game_details, search_board_games
from api.games.exceptions import BggUnavailableError
from api.games.schemas import (
    GameDetailResponse,
    GamePoolManualItem,
    GameSearchItem,
    GameSearchResponse,
    MyGameItem,
    MyGamesResponse,
)
from api.ratings.repository import get_user_rating
from api.ratings.schemas import RatingResponse

logger = logging.getLogger(__name__)

_bgg_cache_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()
_bgg_cache_locks_guard = asyncio.Lock()


async def search_game_catalog(
    session: AsyncSession,
    *,
    query: str,
    limit: int,
    client: httpx.AsyncClient | None = None,
) -> GameSearchResponse:
    """Devuelve juegos activos del catálogo local para el typeahead."""
    query_key = build_game_name_key(query)
    if not query_key:
        return GameSearchResponse(games=[])

    rows = await _search_local(session, query=query, query_key=query_key, limit=limit)
    if (
        not rows
        and client is not None
        and len(query_key) >= config.BGG_EXTERNAL_SEARCH_MIN_LENGTH
    ):
        await _cache_bgg_results_once(
            session,
            client=client,
            query=query,
            query_key=query_key,
        )
        rows = await _search_local(session, query=query, query_key=query_key, limit=limit)

    return GameSearchResponse(
        games=[GameSearchItem.model_validate(row) for row in rows]
    )


async def create_manual_game(
    session: AsyncSession,
    *,
    name: str,
    created_by_user_id: UUID,
) -> GameSearchItem:
    """Da de alta un juego ausente de BGG y lo deja listo para elegir."""
    row = await repository.create_manual_game(
        session,
        name=name,
        name_key=build_game_name_key(name),
        created_by_user_id=created_by_user_id,
    )
    return GameSearchItem(
        id=row.id,
        name=row.name,
        bgg_id=row.bgg_id,
        year_published=row.year_published,
        manuals_count=0,
    )


async def list_my_games(
    session: AsyncSession,
    *,
    user_id: UUID,
    limit: int,
    offset: int,
) -> MyGamesResponse:
    """Biblioteca del usuario: juegos con los que ha interactuado, por actividad."""
    rows = await repository.list_my_games(session, user_id=user_id, limit=limit, offset=offset)
    return MyGamesResponse(games=[MyGameItem.model_validate(row) for row in rows])


async def get_game_detail(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
    client: httpx.AsyncClient,
) -> GameDetailResponse:
    """Construye el hub de un juego con la vista personal del usuario."""
    game = await repository.get_game_for_detail(session, game_id=game_id)
    play_metadata = await _resolve_play_metadata(session, game=game, client=client)
    manuals = await repository.list_game_pool_manuals(
        session,
        game_id=game_id,
        current_user_id=auth.user.id,
    )
    conversations_count = await repository.count_user_game_conversations(
        session,
        user_id=auth.user.id,
        game_id=game_id,
    )
    rating = await get_user_rating(session, user_id=auth.user.id, game_id=game_id)
    return GameDetailResponse(
        id=game.id,
        name=game.name,
        bgg_id=game.bgg_id,
        year_published=game.year_published,
        min_players=play_metadata[0],
        max_players=play_metadata[1],
        playing_time_minutes=play_metadata[2],
        status=game.status,
        my_rating=RatingResponse.model_validate(rating) if rating is not None else None,
        manuals=[GamePoolManualItem.model_validate(manual) for manual in manuals],
        conversations_count=conversations_count,
    )


async def _resolve_play_metadata(
    session: AsyncSession,
    *,
    game: Row,
    client: httpx.AsyncClient,
) -> tuple[int | None, int | None, int | None]:
    """Completa jugadores y duración desde BGG la primera vez que se piden."""
    if (
        game.min_players is not None
        or game.max_players is not None
        or game.playing_time_minutes is not None
        or game.bgg_id is None
    ):
        return game.min_players, game.max_players, game.playing_time_minutes

    try:
        details = await fetch_board_game_details(client, bgg_id=game.bgg_id)
    except BggUnavailableError:
        logger.warning("No se pudieron completar metadatos de BGG para un juego.")
        return None, None, None

    if (
        details.min_players is None
        and details.max_players is None
        and details.playing_time_minutes is None
    ):
        return None, None, None

    try:
        await repository.update_game_play_metadata(
            session,
            game_id=game.id,
            min_players=details.min_players,
            max_players=details.max_players,
            playing_time_minutes=details.playing_time_minutes,
        )
    except SQLAlchemyError:
        await session.rollback()
        logger.warning("No se pudieron guardar metadatos de BGG.", exc_info=True)
    return details.min_players, details.max_players, details.playing_time_minutes


async def _cache_bgg_results_once(
    session: AsyncSession,
    *,
    client: httpx.AsyncClient,
    query: str,
    query_key: str,
) -> None:
    """Coalescea misses concurrentes para no martillear BGG con la misma query."""
    cache_lock = await _bgg_cache_lock(query_key)
    async with cache_lock:
        cached_rows = await _search_local(session, query=query, query_key=query_key, limit=1)
        if cached_rows:
            return
        await _cache_bgg_results(session, client=client, query=query)


async def _bgg_cache_lock(query_key: str) -> asyncio.Lock:
    """Devuelve un lock temporal por query sin acumular memoria indefinidamente."""
    async with _bgg_cache_locks_guard:
        cache_lock = _bgg_cache_locks.get(query_key)
        if cache_lock is None:
            cache_lock = asyncio.Lock()
            _bgg_cache_locks[query_key] = cache_lock
        return cache_lock


async def _search_local(
    session: AsyncSession,
    *,
    query: str,
    query_key: str,
    limit: int,
) -> list[object]:
    """Consulta el catálogo local de Postgres."""
    return await repository.search_games(
        session,
        query=query.strip(),
        query_key=query_key,
        limit=limit,
    )


async def _cache_bgg_results(
    session: AsyncSession,
    *,
    client: httpx.AsyncClient,
    query: str,
) -> None:
    """Cachea resultados de BGG solo cuando el catálogo local no responde."""
    try:
        external_games = await search_board_games(client, query=query.strip())
    except BggUnavailableError:
        return

    try:
        await repository.upsert_bgg_games(
            session,
            games=[
                repository.CachedGameInput(
                    bgg_id=game.bgg_id,
                    name=game.name,
                    name_key=build_game_name_key(game.name),
                    year_published=game.year_published,
                )
                for game in external_games[: config.BGG_CACHE_RESULT_LIMIT]
            ],
        )
    except SQLAlchemyError:
        await session.rollback()
        logger.warning("No se pudo cachear el resultado de BGG.", exc_info=True)


def build_game_name_key(name: str) -> str:
    """Normaliza nombres de juego para búsquedas case-insensitive."""
    return unicodedata.normalize("NFKC", name.strip()).casefold()
