"""Consultas SQL de valoraciones de juegos."""

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from api.ratings.dto import RatingSnapshot
from api.ratings.exceptions import RatingNotFoundError
from database.models.rating import Rating


async def upsert_user_rating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    score: int,
    note: str | None,
) -> RatingSnapshot:
    """Crea o actualiza la valoración en una sola sentencia atómica."""
    stmt = (
        insert(Rating)
        .values(user_id=user_id, game_id=game_id, score=score, note=note)
        .on_conflict_do_update(
            index_elements=[Rating.user_id, Rating.game_id],
            set_={"score": score, "note": note, "updated_at": func.now()},
        )
        .returning(
            Rating.game_id,
            Rating.score,
            Rating.note,
            Rating.created_at,
            Rating.updated_at,
        )
    )
    result = await session.execute(stmt)
    snapshot = RatingSnapshot(**result.mappings().one())
    await session.commit()
    return snapshot


async def get_user_rating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> RatingSnapshot | None:
    """Carga la valoración propia de un juego si existe."""
    result = await session.execute(
        select(
            Rating.game_id,
            Rating.score,
            Rating.note,
            Rating.created_at,
            Rating.updated_at,
        ).where(
            Rating.user_id == user_id,
            Rating.game_id == game_id,
        )
    )
    row = result.mappings().one_or_none()
    if row is None:
        return None
    return RatingSnapshot(**row)


async def delete_user_rating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> None:
    """Quita la valoración propia o lanza 404 estable si no existe."""
    result = await session.execute(
        delete(Rating).where(
            Rating.user_id == user_id,
            Rating.game_id == game_id,
        ).returning(Rating.id)
    )
    if result.scalar_one_or_none() is None:
        raise RatingNotFoundError
    await session.commit()
