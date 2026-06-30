"""DTOs internos de valoraciones."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class RatingSnapshot:
    """Valoración propia de un juego."""

    game_id: UUID
    score: int
    note: str | None
    created_at: datetime
    updated_at: datetime
