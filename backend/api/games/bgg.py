"""Cliente mínimo para cachear juegos desde BoardGameGeek."""

import asyncio
from dataclasses import dataclass
from xml.etree import ElementTree

import httpx

from api import config
from api.games.exceptions import BggUnavailableError

BGG_SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search"
BGG_THING_URL = "https://boardgamegeek.com/xmlapi2/thing"
BGG_BOARDGAME_TYPE = "boardgame"
RETRY_STATUS_CODES = {202, 500, 503}


@dataclass(frozen=True, slots=True)
class BggGame:
    """Juego devuelto por BGG antes de persistirlo en Postgres."""

    bgg_id: int
    name: str
    year_published: int | None


@dataclass(frozen=True, slots=True)
class BggGameDetails:
    """Metadatos de mesa de un juego concreto de BGG."""

    min_players: int | None
    max_players: int | None
    playing_time_minutes: int | None


async def search_board_games(
    client: httpx.AsyncClient,
    *,
    query: str,
) -> list[BggGame]:
    """Busca juegos en BGG respetando respuestas de cola y throttling."""
    response_text = await _get_with_backoff(
        client,
        url=BGG_SEARCH_URL,
        params={"query": query, "type": BGG_BOARDGAME_TYPE},
    )
    return _parse_search_response(response_text)


async def fetch_board_game_details(
    client: httpx.AsyncClient,
    *,
    bgg_id: int,
) -> BggGameDetails:
    """Recupera jugadores y duración de un juego concreto de BGG."""
    response_text = await _get_with_backoff(
        client,
        url=BGG_THING_URL,
        params={"id": str(bgg_id)},
    )
    return _parse_thing_response(response_text)


async def _get_with_backoff(
    client: httpx.AsyncClient,
    *,
    url: str,
    params: dict[str, str],
) -> str:
    """Reintenta cuando BGG responde que la petición está en cola u ocupado."""
    for attempt in range(1, config.BGG_MAX_ATTEMPTS + 1):
        try:
            response = await client.get(url, params=params, timeout=10.0)
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


def _parse_thing_response(response_text: str) -> BggGameDetails:
    """Extrae jugadores y duración saneando valores incoherentes de BGG."""
    try:
        root = ElementTree.fromstring(response_text)
    except ElementTree.ParseError as exc:
        raise BggUnavailableError from exc

    item = root.find("item")
    min_players = _positive_int(_item_value(item, "minplayers"))
    max_players = _positive_int(_item_value(item, "maxplayers"))
    if min_players is not None and max_players is not None and max_players < min_players:
        min_players = None
        max_players = None
    return BggGameDetails(
        min_players=min_players,
        max_players=max_players,
        playing_time_minutes=_positive_int(_item_value(item, "playingtime")),
    )


def _item_value(item: ElementTree.Element | None, tag: str) -> str | None:
    """Lee el atributo value de un subelemento del item de BGG."""
    if item is None:
        return None
    element = item.find(tag)
    return element.get("value") if element is not None else None


def _positive_int(value: str | None) -> int | None:
    """Convierte a entero positivo o descarta el valor."""
    parsed = _optional_int(value)
    if parsed is None or parsed <= 0:
        return None
    return parsed


def _optional_int(value: str | None) -> int | None:
    """Convierte enteros opcionales del XML."""
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None
