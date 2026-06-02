"""Casos de uso del catálogo de juegos."""

import asyncio
import logging
import unicodedata
from weakref import WeakValueDictionary

import httpx
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.games import repository
from api.games.bgg import search_board_games
from api.games.exceptions import BggUnavailableError
from api.games.schemas import GameSearchItem, GameSearchResponse

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
