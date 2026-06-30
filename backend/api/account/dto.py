"""DTOs internos de cuenta."""

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class AccountCleanup:
    """Recursos derivados a limpiar tras confirmar el borrado en Postgres."""

    chunk_ids_by_manual: dict[UUID, list[UUID]]
    storage_keys: list[str]


@dataclass(frozen=True, slots=True)
class AccountActivityStats:
    """Actividad agregada de la cuenta."""

    games_count: int
    conversations_count: int
    manuals_count: int
