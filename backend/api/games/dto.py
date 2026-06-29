"""DTOs internos de juegos."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CachedGameInput:
    """Juego externo normalizado antes de cachearlo en Postgres."""

    bgg_id: int
    name: str
    name_key: str
    year_published: int | None


@dataclass(frozen=True, slots=True)
class GameSearchResult:
    """Juego del catálogo local listo para el typeahead."""

    id: UUID
    name: str
    bgg_id: int | None
    year_published: int | None
    manuals_count: int


@dataclass(frozen=True, slots=True)
class CreatedGame:
    """Juego creado manualmente antes de construir la respuesta pública."""

    id: UUID
    name: str
    bgg_id: int | None
    year_published: int | None


@dataclass(frozen=True, slots=True)
class MyGameSummary:
    """Juego seguido por el usuario con actividad agregada."""

    id: UUID
    name: str
    bgg_id: int | None
    year_published: int | None
    manuals_count: int
    conversations_count: int
    last_activity_at: datetime


@dataclass(frozen=True, slots=True)
class GameDetail:
    """Juego no borrado con su estado visible para el hub."""

    id: UUID
    name: str
    bgg_id: int | None
    year_published: int | None
    status: str


@dataclass(frozen=True, slots=True)
class GamePoolManualSummary:
    """Manual visible dentro del hub de un juego."""

    id: UUID
    title: str | None
    source_type: str
    page_count: int
    created_at: datetime
    is_own: bool
    duplicate_page_count: int


@dataclass(frozen=True, slots=True)
class GameExplanationSnapshot:
    """Explicación cacheada de un juego."""

    sections: dict[str, object]
    source_fingerprint: str
    status: str
    error_code: str | None
    generated_at: datetime | None
    updated_at: datetime | None


@dataclass(frozen=True, slots=True)
class GameExplanationJob:
    """Trabajo opaco para generar la explicación de un juego."""

    user_id: UUID
    game_id: UUID


@dataclass(frozen=True, slots=True)
class GameExplanationOutcome:
    """Snapshot interno y trabajo opcional de generación."""

    snapshot: GameExplanationSnapshot
    job: GameExplanationJob | None
