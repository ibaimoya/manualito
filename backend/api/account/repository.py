"""Consultas SQL de cuenta y actividad del usuario."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, func, select, union, update
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from database.models.asset import Asset
from database.models.auth import AuthSession
from database.models.conversation import Conversation
from database.models.explanation import GameExplanation
from database.models.manual import Manual, ManualChunk
from database.models.rating import Rating
from database.models.user import User


@dataclass(frozen=True, slots=True)
class AccountCleanup:
    """Recursos derivados a limpiar tras confirmar el borrado en Postgres."""

    chunk_ids_by_manual: dict[UUID, list[UUID]]
    storage_keys: list[str]


async def purge_user_account(
    session: AsyncSession,
    *,
    user_id: UUID,
    now: datetime,
) -> AccountCleanup:
    """Marca la cuenta y su contenido como borrados sin confirmar la transacción.

    El servicio audita y hace commit; aquí solo se encadenan las escrituras
    para que el borrado sea todo-o-nada.
    """
    chunk_rows = await session.execute(
        select(ManualChunk.manual_id, ManualChunk.id)
        .join(Manual, Manual.id == ManualChunk.manual_id)
        .where(Manual.owner_user_id == user_id)
    )
    chunk_ids_by_manual: dict[UUID, list[UUID]] = {}
    for row in chunk_rows:
        chunk_ids_by_manual.setdefault(row.manual_id, []).append(row.id)
    storage_keys_result = await session.execute(
        select(Asset.storage_key).where(
            Asset.owner_user_id == user_id,
            Asset.deleted_at.is_(None),
        )
    )
    storage_keys = list(storage_keys_result.scalars())

    await session.execute(
        update(Manual)
        .where(Manual.owner_user_id == user_id, Manual.deleted_at.is_(None))
        .values(deleted_at=now, status="hidden")
    )
    await session.execute(
        update(Asset)
        .where(Asset.owner_user_id == user_id, Asset.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    await session.execute(
        update(Conversation)
        .where(Conversation.user_id == user_id, Conversation.deleted_at.is_(None))
        .values(deleted_at=now, updated_at=now)
    )
    await session.execute(delete(Rating).where(Rating.user_id == user_id))
    await session.execute(
        delete(GameExplanation).where(GameExplanation.user_id == user_id)
    )
    await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await session.execute(
        update(User)
        .where(User.id == user_id)
        .values(status="deleted", deleted_at=now)
    )
    return AccountCleanup(chunk_ids_by_manual=chunk_ids_by_manual, storage_keys=storage_keys)


async def get_user_activity_stats(session: AsyncSession, *, user_id: UUID) -> Row:
    """Agrega juegos con actividad, conversaciones y manuales en una query."""
    games_with_activity = union(
        select(Manual.game_id).where(
            Manual.owner_user_id == user_id,
            Manual.deleted_at.is_(None),
        ),
        select(Conversation.game_id).where(
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        ),
        select(Rating.game_id).where(Rating.user_id == user_id),
    ).subquery()
    games_count = (
        select(func.count()).select_from(games_with_activity).scalar_subquery()
    )
    conversations_count = (
        select(func.count(Conversation.id))
        .where(
            Conversation.user_id == user_id,
            Conversation.deleted_at.is_(None),
        )
        .scalar_subquery()
    )
    manuals_count = (
        select(func.count(Manual.id))
        .where(
            Manual.owner_user_id == user_id,
            Manual.deleted_at.is_(None),
        )
        .scalar_subquery()
    )
    result = await session.execute(
        select(
            games_count.label("games_count"),
            conversations_count.label("conversations_count"),
            manuals_count.label("manuals_count"),
        )
    )
    return result.one()
