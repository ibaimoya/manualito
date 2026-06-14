"""Consultas SQL del catálogo local de juegos."""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.games.exceptions import GameNotFoundError
from common.crypto import sha256_hex
from database.models.conversation import Conversation
from database.models.explanation import GameExplanation
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


async def create_manual_game(
    session: AsyncSession,
    *,
    name: str,
    name_key: str,
    created_by_user_id: UUID,
) -> Row:
    """Inserta un juego sin BGG atribuido al usuario y devuelve su ficha."""
    result = await session.execute(
        insert(Game)
        .values(
            name=name,
            name_key=name_key,
            status="active",
            created_by_user_id=created_by_user_id,
        )
        .returning(Game.id, Game.name, Game.bgg_id, Game.year_published)
    )
    row = result.one()
    await session.commit()
    return row


async def list_my_games(
    session: AsyncSession,
    *,
    user_id: UUID,
    limit: int,
    offset: int,
) -> list[Row]:
    """Juegos con manual o conversacion del usuario, por actividad reciente."""
    engaged = (
        select(Manual.game_id.label("game_id"))
        .where(Manual.owner_user_id == user_id, Manual.deleted_at.is_(None))
        .union(
            select(Conversation.game_id).where(
                Conversation.user_id == user_id,
                Conversation.deleted_at.is_(None),
            ),
        )
        .subquery()
    )
    manuals_count = (
        select(func.count(Manual.id))
        .where(
            Manual.game_id == Game.id,
            Manual.owner_user_id == user_id,
            Manual.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery()
    )
    conversations_count = (
        select(func.count(Conversation.id))
        .where(
            Conversation.game_id == Game.id,
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery()
    )
    last_activity = func.greatest(
        select(func.max(Manual.updated_at))
        .where(
            Manual.game_id == Game.id,
            Manual.owner_user_id == user_id,
            Manual.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery(),
        select(func.max(Conversation.updated_at))
        .where(
            Conversation.game_id == Game.id,
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery(),
    ).label("last_activity_at")

    result = await session.execute(
        select(
            Game.id,
            Game.name,
            Game.bgg_id,
            Game.year_published,
            manuals_count.label("manuals_count"),
            conversations_count.label("conversations_count"),
            last_activity,
        )
        .join(engaged, engaged.c.game_id == Game.id)
        .where(Game.deleted_at.is_(None))
        .order_by(last_activity.desc(), Game.name)
        .limit(limit)
        .offset(offset)
    )
    return list(result)


async def get_game_for_detail(session: AsyncSession, *, game_id: UUID) -> Row:
    """Carga un juego no borrado; uno oculto se devuelve con su estado."""
    result = await session.execute(
        select(
            Game.id,
            Game.name,
            Game.bgg_id,
            Game.year_published,
            Game.min_players,
            Game.max_players,
            Game.playing_time_minutes,
            Game.status,
        ).where(
            Game.id == game_id,
            Game.deleted_at.is_(None),
        )
    )
    game = result.one_or_none()
    if game is None:
        raise GameNotFoundError
    return game


async def list_game_pool_manuals(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
) -> list[Row]:
    """Lista manuales del pool visibles para el usuario sin exponer dueños."""
    result = await session.execute(
        select(
            Manual.id,
            Manual.title,
            Manual.source_type,
            Manual.page_count,
            Manual.created_at,
            (Manual.owner_user_id == current_user_id).label("is_own"),
        )
        .where(*_pool_visibility_filters(game_id, current_user_id))
        .order_by(Manual.created_at.desc(), Manual.id.desc())
    )
    return list(result)


async def get_pool_fingerprint(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
) -> str | None:
    """Huella estable del pool visible; None si no hay manuales que explicar."""
    result = await session.execute(
        select(Manual.id, Manual.indexed_at)
        .where(*_pool_visibility_filters(game_id, current_user_id))
        .order_by(Manual.id.asc())
    )
    items = [
        f"{row.id}:{row.indexed_at.isoformat() if row.indexed_at else ''}"
        for row in result
    ]
    if not items:
        return None
    return sha256_hex("|".join(items))


async def get_game_explanation(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> GameExplanation | None:
    """Carga la explicación cacheada del usuario para un juego."""
    result = await session.execute(
        select(GameExplanation).where(
            GameExplanation.user_id == user_id,
            GameExplanation.game_id == game_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_game_explanation(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    sections: dict[str, object],
    source_fingerprint: str,
) -> Row:
    """Guarda la explicación regenerada en una sola sentencia atómica."""
    stmt = (
        insert(GameExplanation)
        .values(
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=source_fingerprint,
        )
        .on_conflict_do_update(
            index_elements=[GameExplanation.user_id, GameExplanation.game_id],
            set_={
                "sections": sections,
                "source_fingerprint": source_fingerprint,
                "generated_at": func.now(),
                "updated_at": func.now(),
            },
        )
        .returning(
            GameExplanation.sections,
            GameExplanation.source_fingerprint,
            GameExplanation.generated_at,
        )
    )
    result = await session.execute(stmt)
    row = result.one()
    await session.commit()
    return row


def _pool_visibility_filters(game_id: UUID, current_user_id: UUID) -> tuple:
    """Predicado del pool visible: compartidos activos más los propios."""
    return (
        Manual.game_id == game_id,
        Manual.deleted_at.is_(None),
        or_(
            (Manual.visibility == "shared") & (Manual.status == "active"),
            (Manual.owner_user_id == current_user_id)
            & (Manual.status.in_(("active", "pending_review"))),
        ),
    )


async def count_user_game_conversations(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> int:
    """Cuenta conversaciones propias activas de un juego."""
    result = await session.execute(
        select(func.count(Conversation.id)).where(
            Conversation.user_id == user_id,
            Conversation.game_id == game_id,
            Conversation.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def update_game_play_metadata(
    session: AsyncSession,
    *,
    game_id: UUID,
    min_players: int | None,
    max_players: int | None,
    playing_time_minutes: int | None,
) -> None:
    """Rellena metadatos de mesa solo si nadie los escribió antes."""
    await session.execute(
        update(Game)
        .where(
            Game.id == game_id,
            Game.min_players.is_(None),
            Game.max_players.is_(None),
            Game.playing_time_minutes.is_(None),
        )
        .values(
            min_players=min_players,
            max_players=max_players,
            playing_time_minutes=playing_time_minutes,
        )
    )
    await session.commit()


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
