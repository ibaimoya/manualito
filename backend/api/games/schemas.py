"""Schemas públicos del catálogo de juegos."""

from uuid import UUID

from pydantic import Field

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
