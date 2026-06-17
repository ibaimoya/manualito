"""Schemas públicos del catálogo de juegos."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from api.manuals.schemas import AnswerSource
from api.ratings.schemas import RatingResponse
from api.schemas import StrictModel
from database.models.constants import GAME_NAME_MAX_LENGTH

GAME_SEARCH_QUERY_MAX_LENGTH = 100
GAME_SEARCH_LIMIT_DEFAULT = 10
GAME_SEARCH_LIMIT_MAX = 20
BGG_ATTRIBUTION = "Powered by BoardGameGeek."


class GameSearchItem(StrictModel):
    """Juego seleccionable en el typeahead."""

    id: UUID
    name: str = Field(max_length=GAME_NAME_MAX_LENGTH)
    bgg_id: int | None
    year_published: int | None
    manuals_count: int = Field(ge=0)


class GameSearchResponse(StrictModel):
    """Respuesta del typeahead local de juegos."""

    games: list[GameSearchItem]
    attribution: str = BGG_ATTRIBUTION


GameName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=GAME_NAME_MAX_LENGTH),
]


class CreateGameRequest(StrictModel):
    """Alta manual de un juego que no aparece en BoardGameGeek."""

    name: GameName


class MyGameItem(StrictModel):
    """Juego de la biblioteca del usuario (con el que ha interactuado)."""

    id: UUID
    name: str = Field(max_length=GAME_NAME_MAX_LENGTH)
    bgg_id: int | None
    year_published: int | None
    manuals_count: int = Field(ge=0)
    conversations_count: int = Field(ge=0)
    last_activity_at: datetime


class MyGamesResponse(StrictModel):
    """Biblioteca del usuario: juegos por actividad reciente."""

    games: list[MyGameItem]


class GamePoolManualItem(StrictModel):
    """Manual visible en el hub del juego."""

    id: UUID
    title: str | None
    source_type: str
    page_count: int = Field(ge=1)
    duplicate_page_count: int = Field(default=0, ge=0)
    created_at: datetime
    is_own: bool


class ExplanationSection(StrictModel):
    """Sección de la explicación con su respuesta y fuentes."""

    answer: str
    sources: list[AnswerSource] = Field(default_factory=list)


class GameExplanationResponse(StrictModel):
    """Explicación cacheada y compartida del juego."""

    status: Literal["ready", "generating", "failed"]
    sections: dict[str, ExplanationSection] | None
    generated_at: datetime | None
    error_code: str | None = None


class GameDetailResponse(StrictModel):
    """Hub de un juego con la vista personal del usuario."""

    id: UUID
    name: str = Field(max_length=GAME_NAME_MAX_LENGTH)
    bgg_id: int | None
    year_published: int | None
    min_players: int | None
    max_players: int | None
    playing_time_minutes: int | None
    status: str
    my_rating: RatingResponse | None
    manuals: list[GamePoolManualItem]
    conversations_count: int = Field(ge=0)
    is_following: bool
    attribution: str = BGG_ATTRIBUTION
