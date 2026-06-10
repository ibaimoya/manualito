"""Schemas públicos de valoraciones de juegos."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from api.schemas import StrictModel
from database.models.constants import RATING_NOTE_MAX_LENGTH

RATING_SCORE_MIN = 1
RATING_SCORE_MAX = 5
RatingNote = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=RATING_NOTE_MAX_LENGTH,
    ),
]


class RateGameRequest(StrictModel):
    """Valoración personal enviada por el usuario."""

    score: int = Field(ge=RATING_SCORE_MIN, le=RATING_SCORE_MAX)
    note: RatingNote | None = None


class RatingResponse(StrictModel):
    """Valoración propia de un juego visible para el usuario."""

    game_id: UUID
    score: int = Field(ge=RATING_SCORE_MIN, le=RATING_SCORE_MAX)
    note: str | None
    created_at: datetime
    updated_at: datetime
