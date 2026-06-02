"""Cliente mínimo para cachear juegos desde BoardGameGeek."""

import asyncio
from dataclasses import dataclass
from xml.etree import ElementTree

import httpx

from api import config
from api.games.exceptions import BggUnavailableError

BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
BGG_BOARDGAME_TYPE = "boardgame"
RETRY_STATUS_CODES = {202, 500, 503}


@dataclass(frozen=True, slots=True)
class BggGame:
    """Juego devuelto por BGG antes de persistirlo en Postgres."""

    bgg_id: int
    name: str
    year_published: int | None


async def search_board_games(
    client: httpx.AsyncClient,
    *,
    query: str,
) -> list[BggGame]:
    """Busca juegos en BGG respetando respuestas de cola y throttling."""
    response_text = await _get_with_backoff(
        client,
        query=query,
    )
    return _parse_search_response(response_text)


async def _get_with_backoff(
    client: httpx.AsyncClient,
    *,
    query: str,
) -> str:
    """Reintenta cuando BGG responde que la petición está en cola u ocupado."""
    for attempt in range(1, config.BGG_MAX_ATTEMPTS + 1):
        try:
            response = await client.get(
                BGG_SEARCH_URL,
                params={"query": query, "type": BGG_BOARDGAME_TYPE},
                timeout=10.0,
            )
        except httpx.HTTPError as exc:
            raise BggUnavailableError from exc
        if response.status_code == 200:
            return response.text
        if response.status_code in RETRY_STATUS_CODES and attempt < config.BGG_MAX_ATTEMPTS:
            await asyncio.sleep(config.BGG_BACKOFF_SECONDS * attempt)
            continue
        raise BggUnavailableError

    raise BggUnavailableError


def _parse_search_response(response_text: str) -> list[BggGame]:
    """Extrae los campos mínimos que cacheamos en Postgres."""
    try:
        root = ElementTree.fromstring(response_text)
    except ElementTree.ParseError as exc:
        raise BggUnavailableError from exc

    return [
        game
        for item in root.findall("item")
        if (game := _parse_item(item)) is not None
    ]


def _parse_item(item: ElementTree.Element) -> BggGame | None:
    """Convierte un nodo XML de BGG en DTO interno."""
    item_id = item.get("id")
    name_element = item.find("name")
    name = name_element.get("value") if name_element is not None else None
    if item_id is None or not name:
        return None

    try:
        bgg_id = int(item_id)
    except ValueError:
        return None

    year_element = item.find("yearpublished")
    return BggGame(
        bgg_id=bgg_id,
        name=name,
        year_published=_optional_int(
            year_element.get("value") if year_element is not None else None
        ),
    )


def _optional_int(value: str | None) -> int | None:
    """Convierte enteros opcionales del XML."""
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None
