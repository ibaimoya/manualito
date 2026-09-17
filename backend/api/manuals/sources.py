"""Fuentes con títulos actuales y nombres de usuario autorizados."""

from collections.abc import Iterable, Mapping, Sequence
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from api.manuals.dto import ManualSourceInfo
from api.manuals.repository import load_manual_source_info
from api.manuals.schemas import AnswerSource

# Los nombres de usuario se consultan al leer las fuentes.
SNAPSHOT_EXCLUDED_FIELDS = frozenset({"author_name"})


def source_snapshot(source: AnswerSource, *, exclude: Iterable[str] = ()) -> dict[str, object]:
    """Prepara una fuente para guardarla sin el nombre de usuario."""
    return source.model_dump(mode="json", exclude={*SNAPSHOT_EXCLUDED_FIELDS, *exclude})


async def resolve_source_info(
    session: AsyncSession,
    *,
    current_user_id: UUID,
    sources: Iterable[AnswerSource],
) -> dict[UUID, ManualSourceInfo]:
    """Consulta una vez los datos actuales de los manuales citados."""
    return await load_manual_source_info(
        session,
        current_user_id=current_user_id,
        manual_ids={source.manual_id for source in sources},
    )


def refresh_sources(
    sources: Sequence[AnswerSource],
    info: Mapping[UUID, ManualSourceInfo],
) -> list[AnswerSource]:
    """Actualiza las fuentes y conserva el título histórico si ya no hay acceso."""
    refreshed: list[AnswerSource] = []
    for source in sources:
        current = info.get(source.manual_id)
        if current is None:
            refreshed.append(source.model_copy(update={"author_name": None}))
        else:
            refreshed.append(
                source.model_copy(
                    update={"manual_title": current.title, "author_name": current.author_name}
                )
            )
    return refreshed
