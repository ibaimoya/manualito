"""Consultas SQL del catálogo local de juegos."""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.games.exceptions import GameNotFoundError
from database.models.game import Game
from database.models.manual import Manual

SIMILARITY_THRESHOLD = 0.1


@dataclass(frozen=True, slots=True)
class CachedGameInput:
    """Juego externo normalizado antes de cachearlo en Postgres."""

    bgg_id: int
    name: str
    name_key: str
    year_published: int | None


async def search_games(
    session: AsyncSession,
    *,
    query: str,
    query_key: str,
    limit: int,
) -> list[Row]:
    """Busca juegos activos en Postgres, ordenando por prefijo, similitud y uso."""
    manuals_count = (
        select(Manual.game_id, func.count(Manual.id).label("manuals_count"))
        .where(
            Manual.deleted_at.is_(None),
            Manual.status == "active",
            Manual.visibility == "shared",
        )
        .group_by(Manual.game_id)
        .subquery()
    )
    popularity = func.coalesce(manuals_count.c.manuals_count, 0).label("manuals_count")
    prefix_rank = case((Game.name_key.startswith(query_key, autoescape=True), 0), else_=1)
    similarity = func.similarity(Game.name, query)

    result = await session.execute(
        select(
            Game.id,
            Game.name,
            Game.bgg_id,
            Game.year_published,
            popularity,
        )
        .outerjoin(manuals_count, manuals_count.c.game_id == Game.id)
        .where(
            Game.deleted_at.is_(None),
            Game.status == "active",
            or_(
                Game.name_key.contains(query_key, autoescape=True),
                similarity > SIMILARITY_THRESHOLD,
            ),
        )
        .order_by(prefix_rank, similarity.desc(), popularity.desc(), Game.name)
        .limit(limit)
    )

    return list(result)


async def ensure_active_game(session: AsyncSession, *, game_id: UUID) -> None:
    """Comprueba que un juego existe y se puede usar en flujos públicos."""
    game_exists = await session.scalar(
        select(Game.id).where(
            Game.id == game_id,
            Game.status == "active",
            Game.deleted_at.is_(None),
        )
    )
    if game_exists is None:
        raise GameNotFoundError


async def upsert_bgg_games(
    session: AsyncSession,
    *,
    games: list[CachedGameInput],
) -> None:
    """Inserta o actualiza juegos de BGG usando su id externo como clave."""
    if not games:
        return

    deduplicated_games = list({game.bgg_id: game for game in games}.values())
    stmt = insert(Game).values(
        [
            {
                "name": game.name,
                "name_key": game.name_key,
                "bgg_id": game.bgg_id,
                "year_published": game.year_published,
                "status": "active",
            }
            for game in deduplicated_games
        ]
    )
    await session.execute(
        stmt.on_conflict_do_update(
            index_elements=[Game.bgg_id],
            index_where=Game.bgg_id.is_not(None) & Game.deleted_at.is_(None),
            set_={
                "name": stmt.excluded.name,
                "name_key": stmt.excluded.name_key,
                "year_published": stmt.excluded.year_published,
                "status": "active",
            },
        )
    )
    await session.commit()
