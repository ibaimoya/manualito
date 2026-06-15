"""Consultas SQL de valoraciones de juegos."""

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.ratings.exceptions import RatingNotFoundError
from database.models.rating import Rating


async def upsert_user_rating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
    score: int,
    note: str | None,
) -> Row:
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
    row = result.one()
    await session.commit()
    return row


async def get_user_rating(
    session: AsyncSession,
    *,
    user_id: UUID,
    game_id: UUID,
) -> Row | None:
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
    return result.one_or_none()


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
        )
    )
    if result.rowcount == 0:
        raise RatingNotFoundError
    await session.commit()
