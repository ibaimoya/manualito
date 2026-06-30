"""Consultas SQL del catálogo local de juegos."""

from uuid import UUID

from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from api.games.dto import (
    CachedGameInput,
    CreatedGame,
    GameDetail,
    GameExplanationSnapshot,
    GamePoolManualSummary,
    GameSearchResult,
    MyGameSummary,
)
from api.games.exceptions import GameNotFoundError
from common.crypto import sha256_hex
from database.models.conversation import Conversation
from database.models.explanation import GameExplanation
from database.models.game import Game
from database.models.game_follow import GameFollow
from database.models.manual import Manual, ManualPage

SIMILARITY_THRESHOLD = 0.1


async def search_games(
    session: AsyncSession,
    *,
    query: str,
    query_key: str,
    limit: int,
) -> list[GameSearchResult]:
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

    return [GameSearchResult(**row) for row in result.mappings()]


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
) -> CreatedGame:
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
    game = CreatedGame(**result.mappings().one())
    await session.commit()
    return game


async def list_my_games(
    session: AsyncSession,
    *,
    user_id: UUID,
    limit: int,
    offset: int,
) -> list[MyGameSummary]:
    """Juegos seguidos por el usuario, por actividad reciente o seguimiento."""
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
    manual_activity_at = (
        select(func.max(Manual.updated_at))
        .where(
            Manual.game_id == Game.id,
            Manual.owner_user_id == user_id,
            Manual.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery()
    )
    conversation_activity_at = (
        select(func.max(Conversation.updated_at))
        .where(
            Conversation.game_id == Game.id,
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
        .correlate(Game)
        .scalar_subquery()
    )
    last_activity = func.greatest(
        func.coalesce(manual_activity_at, GameFollow.updated_at),
        func.coalesce(conversation_activity_at, GameFollow.updated_at),
        GameFollow.updated_at,
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
        .join(GameFollow, GameFollow.game_id == Game.id)
        .where(
            GameFollow.user_id == user_id,
            GameFollow.following.is_(True),
            Game.deleted_at.is_(None),
        )
        .order_by(last_activity.desc(), Game.name)
        .limit(limit)
        .offset(offset)
    )
    return [MyGameSummary(**row) for row in result.mappings()]


async def auto_follow_game(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> None:
    """Sigue un juego solo si no había una elección explícita previa."""
    stmt = (
        insert(GameFollow)
        .values(user_id=user_id, game_id=game_id, following=True)
        .on_conflict_do_nothing(
            index_elements=[GameFollow.user_id, GameFollow.game_id],
        )
    )
    await session.execute(stmt)
    await session.commit()


async def set_game_follow(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    following: bool,
) -> None:
    """Guarda la elección explícita de seguir o dejar de seguir."""
    stmt = (
        insert(GameFollow)
        .values(user_id=user_id, game_id=game_id, following=following)
        .on_conflict_do_update(
            index_elements=[GameFollow.user_id, GameFollow.game_id],
            set_={"following": following, "updated_at": func.now()},
        )
    )
    await session.execute(stmt)
    await session.commit()


async def is_following(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> bool:
    """Indica si el usuario sigue el juego."""
    result = await session.execute(
        select(GameFollow.following).where(
            GameFollow.user_id == user_id,
            GameFollow.game_id == game_id,
        )
    )
    return bool(result.scalar_one_or_none())


async def get_game_for_detail(session: AsyncSession, *, game_id: UUID) -> GameDetail:
    """Carga un juego no borrado; uno oculto se devuelve con su estado."""
    result = await session.execute(
        select(
            Game.id,
            Game.name,
            Game.bgg_id,
            Game.year_published,
            Game.status,
        ).where(
            Game.id == game_id,
            Game.deleted_at.is_(None),
        )
    )
    row = result.mappings().one_or_none()
    if row is None:
        raise GameNotFoundError
    return GameDetail(**row)


async def list_game_pool_manuals(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
) -> list[GamePoolManualSummary]:
    """Lista manuales visibles para el usuario sin exponer dueños."""
    result = await session.execute(
        select(
            Manual.id,
            Manual.title,
            Manual.source_type,
            Manual.page_count,
            Manual.created_at,
            (Manual.owner_user_id == current_user_id).label("is_own"),
            select(func.count())
            .select_from(ManualPage)
            .where(
                ManualPage.manual_id == Manual.id,
                ManualPage.source_reused_from_page_id.is_not(None),
            )
            .scalar_subquery()
            .label("duplicate_page_count"),
        )
        .where(*_pool_visibility_filters(game_id, current_user_id))
        .order_by(Manual.created_at.desc(), Manual.id.desc())
    )
    return [GamePoolManualSummary(**row) for row in result.mappings()]


async def game_pool_has_manuals(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
) -> bool:
    """Indica si el juego conserva algún manual citable por el usuario."""
    result = await session.execute(
        select(Manual.id).where(*_pool_visibility_filters(game_id, current_user_id)).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def get_pool_fingerprint(
    session: AsyncSession,
    *,
    game_id: UUID,
    current_user_id: UUID,
) -> str | None:
    """Huella estable de manuales visibles; None si no hay manuales que explicar."""
    result = await session.execute(
        select(Manual.id, Manual.indexed_at)
        .where(*_pool_visibility_filters(game_id, current_user_id))
        .order_by(Manual.id.asc())
    )
    items = [f"{row.id}:{row.indexed_at.isoformat() if row.indexed_at else ''}" for row in result]
    if not items:
        return None
    fingerprint: str = sha256_hex("|".join(items))
    return fingerprint


async def get_game_explanation(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> GameExplanationSnapshot | None:
    """Carga la explicación cacheada de un juego para un usuario."""
    result = await session.execute(
        select(GameExplanation).where(
            GameExplanation.user_id == user_id,
            GameExplanation.game_id == game_id,
        )
    )
    explanation = result.scalar_one_or_none()
    if explanation is None:
        return None
    return _game_explanation_snapshot(explanation)


async def upsert_game_explanation(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    sections: dict[str, object],
    source_fingerprint: str,
) -> GameExplanationSnapshot:
    """Guarda la explicación del usuario en una sola sentencia atómica."""
    stmt = (
        insert(GameExplanation)
        .values(
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=source_fingerprint,
            status="ready",
            error_code=None,
        )
        .on_conflict_do_update(
            index_elements=[GameExplanation.user_id, GameExplanation.game_id],
            set_={
                "sections": sections,
                "source_fingerprint": source_fingerprint,
                "status": "ready",
                "error_code": None,
                "generated_at": func.now(),
                "updated_at": func.now(),
            },
        )
        .returning(
            GameExplanation.sections,
            GameExplanation.source_fingerprint,
            GameExplanation.status,
            GameExplanation.error_code,
            GameExplanation.generated_at,
            GameExplanation.updated_at,
        )
    )
    result = await session.execute(stmt)
    snapshot = GameExplanationSnapshot(**result.mappings().one())
    await session.commit()
    return snapshot


async def mark_game_explanation_generating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    sections: dict[str, object],
    source_fingerprint: str,
) -> GameExplanationSnapshot:
    """Guarda que la explicación del usuario se está generando para una huella."""
    stmt = (
        insert(GameExplanation)
        .values(
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=source_fingerprint,
            status="generating",
            error_code=None,
        )
        .on_conflict_do_update(
            index_elements=[GameExplanation.user_id, GameExplanation.game_id],
            set_={
                "sections": sections,
                "source_fingerprint": source_fingerprint,
                "status": "generating",
                "error_code": None,
                "updated_at": func.now(),
            },
        )
        .returning(
            GameExplanation.sections,
            GameExplanation.source_fingerprint,
            GameExplanation.status,
            GameExplanation.error_code,
            GameExplanation.generated_at,
            GameExplanation.updated_at,
        )
    )
    result = await session.execute(stmt)
    snapshot = GameExplanationSnapshot(**result.mappings().one())
    await session.commit()
    return snapshot


async def mark_game_explanation_failed(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    sections: dict[str, object],
    source_fingerprint: str,
    error_code: str,
) -> None:
    """Marca la explicación como fallida sin perder apartados parciales."""
    stmt = (
        insert(GameExplanation)
        .values(
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=source_fingerprint,
            status="failed",
            error_code=error_code,
        )
        .on_conflict_do_update(
            index_elements=[GameExplanation.user_id, GameExplanation.game_id],
            set_={
                "sections": sections,
                "source_fingerprint": source_fingerprint,
                "status": "failed",
                "error_code": error_code,
                "updated_at": func.now(),
            },
        )
    )
    await session.execute(stmt)
    await session.commit()


def _game_explanation_snapshot(explanation: GameExplanation) -> GameExplanationSnapshot:
    """Convierte el modelo cacheado al DTO interno."""
    return GameExplanationSnapshot(
        sections=explanation.sections,
        source_fingerprint=explanation.source_fingerprint,
        status=explanation.status,
        error_code=explanation.error_code,
        generated_at=explanation.generated_at,
        updated_at=explanation.updated_at,
    )


def _pool_visibility_filters(
    game_id: UUID,
    current_user_id: UUID,
) -> tuple[ColumnElement[bool], ...]:
    """Predicado de manuales visibles: compartidos activos más los propios."""
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
