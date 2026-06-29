from functools import partial
from unittest.mock import AsyncMock
from uuid import UUID

import anyio
import httpx
import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError

import api.games.bgg as bgg_client
from api import config
from api.games.bgg import BggGame, search_board_games
from api.games.dependencies import valid_game_form_id, valid_game_id
from api.games.dto import CachedGameInput, GameSearchResult
from api.games.exceptions import BggUnavailableError, GameNotFoundError
from api.games.repository import (
    ensure_active_game,
    search_games,
    upsert_bgg_games,
)
from api.games.schemas import BGG_ATTRIBUTION, GameSearchItem, GameSearchResponse
from api.games.service import build_game_name_key, search_game_catalog
from api.main import app
from api.rate_limit import limiter
from database.session import get_db_session

_GAME_ID = UUID("018fd000-0000-7000-8000-000000000001")
_GAME_NAME = "Catan"
_GAME_QUERY = "cat"


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Cada test empieza con el limitador en estado limpio."""
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def override_db_session():
    """Inyecta una sesión falsa para endpoints de catálogo."""

    def _fake_db_session():
        yield object()

    app.dependency_overrides[get_db_session] = _fake_db_session
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db_session, None)


def test_games_endpoint_returns_public_schema(client, monkeypatch, override_db_session):
    """El typeahead devuelve schema explícito y atribución de BGG."""
    monkeypatch.setattr(
        "api.games.router.search_game_catalog",
        AsyncMock(
            return_value=GameSearchResponse(
                games=[
                    GameSearchItem(
                        id=_GAME_ID,
                        name=_GAME_NAME,
                        bgg_id=13,
                        year_published=1995,
                        manuals_count=2,
                    )
                ]
            )
        ),
    )

    response = client.get("/api/games", params={"q": _GAME_QUERY, "limit": 5})

    assert response.status_code == 200
    assert response.json() == {
        "games": [
            {
                "id": str(_GAME_ID),
                "name": _GAME_NAME,
                "bgg_id": 13,
                "year_published": 1995,
                "manuals_count": 2,
            }
        ],
        "attribution": BGG_ATTRIBUTION,
    }


def test_games_endpoint_is_rate_limited_before_search(client, monkeypatch, override_db_session):
    """El typeahead público se corta en API antes de disparar búsquedas externas."""
    search_mock = AsyncMock(return_value=GameSearchResponse(games=[]))
    monkeypatch.setattr("api.games.router.search_game_catalog", search_mock)

    responses = [
        client.get("/api/games", params={"q": f"cat{index}", "limit": 5})
        for index in range(121)
    ]

    assert responses[-1].status_code == 429
    assert responses[-1].headers["Retry-After"] == "60"
    assert responses[-1].headers["RateLimit-Remaining"] == "0"
    assert search_mock.await_count == 120


def test_build_game_name_key_normalizes_unicode_and_case():
    """La clave de búsqueda normaliza Unicode y mayúsculas."""
    assert build_game_name_key("  CATÁN  ") == "catán"
    assert build_game_name_key("Cafe\u0301") == "caf\u00e9"


def test_search_game_catalog_returns_empty_for_blank_query(monkeypatch):
    """Una query vacía tras trim no consulta Postgres."""
    repository_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.search_games", repository_mock)

    response = anyio.run(partial(search_game_catalog, object(), query="   ", limit=10))

    assert response == GameSearchResponse(games=[])
    repository_mock.assert_not_called()


def test_search_game_catalog_maps_repository_results(monkeypatch):
    """El service transforma resultados internos en contrato público."""
    game = GameSearchResult(
        id=_GAME_ID,
        name=_GAME_NAME,
        bgg_id=13,
        year_published=1995,
        manuals_count=4,
    )
    repository_mock = AsyncMock(return_value=[game])
    monkeypatch.setattr("api.games.service.repository.search_games", repository_mock)

    response = anyio.run(
        partial(search_game_catalog, object(), query=" Catan ", limit=10)
    )

    assert response.games == [
        GameSearchItem(
            id=_GAME_ID,
            name=_GAME_NAME,
            bgg_id=13,
            year_published=1995,
            manuals_count=4,
        )
    ]
    repository_mock.assert_awaited_once()


def test_search_game_catalog_caches_bgg_results_on_local_miss(monkeypatch):
    """Si Postgres no tiene resultados, se consulta BGG una vez y se cachea."""
    game = GameSearchResult(
        id=_GAME_ID,
        name=_GAME_NAME,
        bgg_id=13,
        year_published=1995,
        manuals_count=0,
    )
    search_mock = AsyncMock(side_effect=[[], [], [game]])
    bgg_mock = AsyncMock(
        return_value=[BggGame(bgg_id=13, name=_GAME_NAME, year_published=1995)]
    )
    upsert_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    response = anyio.run(
        partial(
            search_game_catalog,
            object(),
            query=" Catan ",
            limit=10,
            client=object(),
        )
    )

    assert response.games[0].name == _GAME_NAME
    assert search_mock.await_count == 3
    bgg_mock.assert_awaited_once()
    cached_games = upsert_mock.await_args.kwargs["games"]
    assert cached_games == [
        CachedGameInput(
            bgg_id=13,
            name=_GAME_NAME,
            name_key="catan",
            year_published=1995,
        )
    ]


def test_search_game_catalog_skips_external_bgg_for_short_query(monkeypatch):
    """Las queries cortas solo buscan en local para no martillear BGG."""
    search_mock = AsyncMock(return_value=[])
    bgg_mock = AsyncMock()
    upsert_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    response = anyio.run(
        partial(search_game_catalog, object(), query="Ca", limit=10, client=object())
    )

    assert response == GameSearchResponse(games=[])
    search_mock.assert_awaited_once()
    bgg_mock.assert_not_called()
    upsert_mock.assert_not_called()


def test_search_game_catalog_keeps_typeahead_when_cache_write_fails(monkeypatch):
    """Un fallo de cache BGG no convierte el typeahead en 500."""
    session = AsyncMock()
    search_mock = AsyncMock(return_value=[])
    bgg_mock = AsyncMock(
        return_value=[BggGame(bgg_id=13, name=_GAME_NAME, year_published=1995)]
    )
    upsert_mock = AsyncMock(side_effect=SQLAlchemyError("boom"))
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    response = anyio.run(
        partial(search_game_catalog, session, query="Catan", limit=10, client=object())
    )

    assert response == GameSearchResponse(games=[])
    assert search_mock.await_count == 3
    session.rollback.assert_awaited_once()


def test_search_game_catalog_caches_bgg_results_with_bounded_batch(monkeypatch):
    """Cada miss cachea un lote generoso pero acotado de resultados externos."""
    search_mock = AsyncMock(return_value=[])
    bgg_mock = AsyncMock(
        return_value=[
            BggGame(bgg_id=index + 1, name=f"Game {index + 1}", year_published=None)
            for index in range(config.BGG_CACHE_RESULT_LIMIT + 5)
        ]
    )
    upsert_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    response = anyio.run(
        partial(search_game_catalog, object(), query="Game", limit=10, client=object())
    )

    assert response == GameSearchResponse(games=[])
    assert len(upsert_mock.await_args.kwargs["games"]) == config.BGG_CACHE_RESULT_LIMIT


def test_search_game_catalog_returns_empty_when_bgg_is_unavailable(monkeypatch):
    """Si BGG no responde y no hay cache local, el typeahead queda vacío."""
    search_mock = AsyncMock(return_value=[])
    bgg_mock = AsyncMock(side_effect=BggUnavailableError)
    upsert_mock = AsyncMock()
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    response = anyio.run(
        partial(search_game_catalog, object(), query="Catan", limit=10, client=object())
    )

    assert response == GameSearchResponse(games=[])
    bgg_mock.assert_awaited_once()
    upsert_mock.assert_not_called()


def test_search_game_catalog_coalesces_concurrent_bgg_miss(monkeypatch):
    """Dos misses iguales concurrentes comparten una sola consulta BGG."""
    cached = False
    game = GameSearchResult(
        id=_GAME_ID,
        name=_GAME_NAME,
        bgg_id=13,
        year_published=1995,
        manuals_count=0,
    )

    async def fake_search_games(*_args, **_kwargs):
        await anyio.lowlevel.checkpoint()
        return [game] if cached else []

    async def fake_search_board_games(*_args, **_kwargs):
        await anyio.sleep(0.01)
        return [BggGame(bgg_id=13, name=_GAME_NAME, year_published=1995)]

    async def fake_upsert_bgg_games(*_args, **_kwargs):
        nonlocal cached
        await anyio.lowlevel.checkpoint()
        cached = True

    search_mock = AsyncMock(side_effect=fake_search_games)
    bgg_mock = AsyncMock(side_effect=fake_search_board_games)
    upsert_mock = AsyncMock(side_effect=fake_upsert_bgg_games)
    monkeypatch.setattr("api.games.service.repository.search_games", search_mock)
    monkeypatch.setattr("api.games.service.search_board_games", bgg_mock)
    monkeypatch.setattr("api.games.service.repository.upsert_bgg_games", upsert_mock)

    async def run_two_searches():
        results = []

        async def run_one_search():
            result = await search_game_catalog(
                object(),
                query="Catan",
                limit=10,
                client=object(),
            )
            results.append(result)

        async with anyio.create_task_group() as task_group:
            task_group.start_soon(run_one_search)
            task_group.start_soon(run_one_search)
        return results

    results = anyio.run(run_two_searches)

    assert [response.games[0].name for response in results] == [_GAME_NAME, _GAME_NAME]
    bgg_mock.assert_awaited_once()
    upsert_mock.assert_awaited_once()


def test_search_games_builds_typeahead_query_and_projects_results():
    """El repositorio aplica filtros activos y devuelve DTOs proyectados."""

    class FakeResult:
        def mappings(self):
            return [
                {
                    "id": _GAME_ID,
                    "name": _GAME_NAME,
                    "bgg_id": 13,
                    "year_published": 1995,
                    "manuals_count": 3,
                }
            ]

    class FakeSession:
        def __init__(self):
            self.statement = None

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return FakeResult()

    session = FakeSession()

    games = anyio.run(
        partial(search_games, session, query=_GAME_QUERY, query_key=_GAME_QUERY, limit=5)
    )

    assert games[0].id == _GAME_ID
    assert games[0].manuals_count == 3
    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "similarity" in compiled
    assert "manuals" in compiled
    assert "manuals.visibility = " in compiled
    assert "ESCAPE" in compiled


def test_ensure_active_game_accepts_active_game():
    """La dependencia de juego usa una comprobación ligera por id."""

    class FakeSession:
        async def scalar(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement
            return _GAME_ID

    session = FakeSession()

    anyio.run(partial(ensure_active_game, session, game_id=_GAME_ID))

    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "games.status =" in compiled
    assert "games.deleted_at IS NULL" in compiled


def test_ensure_active_game_raises_for_missing_game():
    """Un juego oculto, borrado o inexistente se traduce a 404 de dominio."""

    class FakeSession:
        async def scalar(self, _statement):
            await anyio.lowlevel.checkpoint()
            return None

    with pytest.raises(GameNotFoundError):
        anyio.run(partial(ensure_active_game, FakeSession(), game_id=_GAME_ID))


def test_valid_game_dependencies_return_validated_id(monkeypatch):
    """Las dependencias reutilizables devuelven el UUID ya validado."""
    ensure_mock = AsyncMock()
    monkeypatch.setattr("api.games.dependencies.ensure_active_game", ensure_mock)
    session = object()

    assert anyio.run(partial(valid_game_id, _GAME_ID, session)) == _GAME_ID
    assert anyio.run(partial(valid_game_form_id, _GAME_ID, session)) == _GAME_ID
    assert ensure_mock.await_count == 2


def test_upsert_bgg_games_builds_postgres_upsert():
    """El cache de BGG usa upsert por bgg_id y no SELECT-then-INSERT."""

    class FakeSession:
        def __init__(self):
            self.statement = None
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    anyio.run(
        partial(
            upsert_bgg_games,
            session,
            games=[
                CachedGameInput(
                    bgg_id=13,
                    name=_GAME_NAME,
                    name_key="catan",
                    year_published=1995,
                )
            ],
        )
    )

    compiled = str(session.statement.compile(dialect=postgresql.dialect()))
    assert "ON CONFLICT" in compiled
    assert "bgg_id IS NOT NULL AND deleted_at IS NULL" in compiled
    assert session.commits == 1


def test_upsert_bgg_games_skips_empty_input():
    """Sin juegos externos no hay escritura ni commit."""
    session = AsyncMock()

    anyio.run(partial(upsert_bgg_games, session, games=[]))

    session.execute.assert_not_called()
    session.commit.assert_not_called()


def test_upsert_bgg_games_deduplicates_batch_by_bgg_id():
    """Un lote externo repetido no puede romper el upsert multi-fila."""

    class FakeSession:
        def __init__(self):
            self.statement = None
            self.commits = 0

        async def execute(self, statement):
            await anyio.lowlevel.checkpoint()
            self.statement = statement

        async def commit(self):
            await anyio.lowlevel.checkpoint()
            self.commits += 1

    session = FakeSession()

    anyio.run(
        partial(
            upsert_bgg_games,
            session,
            games=[
                CachedGameInput(
                    bgg_id=13,
                    name="Old Catan",
                    name_key="old catan",
                    year_published=1994,
                ),
                CachedGameInput(
                    bgg_id=13,
                    name=_GAME_NAME,
                    name_key="catan",
                    year_published=1995,
                ),
            ],
        )
    )

    params = session.statement.compile(dialect=postgresql.dialect()).params
    names = [value for key, value in params.items() if key.startswith("name_m")]
    assert names == [_GAME_NAME]
    assert session.commits == 1


def test_bgg_search_parses_successful_xml():
    """BGG 200 se parsea al DTO cacheable en Postgres."""
    client = _bgg_client(
        200,
        """
        <items>
          <item type="boardgame" id="13">
            <name type="primary" value="Catan" />
            <yearpublished value="1995" />
          </item>
          <item type="boardgame" id="822">
            <name type="primary" value="Carcassonne" />
          </item>
        </items>
        """,
    )

    games = anyio.run(partial(search_board_games, client, query="cat"))

    assert games[0].bgg_id == 13
    assert games[0].year_published == 1995
    assert games[1].name == "Carcassonne"
    assert games[1].year_published is None


def test_bgg_search_skips_items_without_required_fields():
    """Un item incompleto de BGG no tumba toda la respuesta."""
    client = _bgg_client(
        200,
        """
        <items>
          <item type="boardgame" id="13" />
          <item type="boardgame" id="not-an-int">
            <name type="primary" value="Broken" />
          </item>
          <item type="boardgame" id="822">
            <name type="primary" value="Carcassonne" />
          </item>
          <item type="boardgame" id="14">
            <name type="primary" value="Valid Without Year" />
            <yearpublished value="soon" />
          </item>
        </items>
        """,
    )

    games = anyio.run(partial(search_board_games, client, query="car"))

    assert games == [
        BggGame(bgg_id=822, name="Carcassonne", year_published=None),
        BggGame(bgg_id=14, name="Valid Without Year", year_published=None),
    ]


def test_bgg_search_retries_when_request_is_queued(monkeypatch):
    """BGG 202 usa backoff antes de reintentar."""
    client = _bgg_client(
        (202, ""),
        (
            200,
            """
            <items>
              <item type="boardgame" id="13">
                <name type="primary" value="Catan" />
              </item>
            </items>
            """,
        ),
    )
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        await anyio.lowlevel.checkpoint()
        sleeps.append(seconds)

    monkeypatch.setattr(bgg_client.config, "BGG_BACKOFF_SECONDS", 0.5)
    monkeypatch.setattr(bgg_client.asyncio, "sleep", fake_sleep)

    games = anyio.run(partial(search_board_games, client, query="cat"))

    assert games[0].bgg_id == 13
    assert sleeps == [0.5]


@pytest.mark.parametrize("status_code", [404, 503])
def test_bgg_search_raises_for_unusable_response(status_code: int, monkeypatch):
    """Errores no usables de BGG se quedan como excepción de dominio."""
    client = _bgg_client(status_code, "")
    monkeypatch.setattr(bgg_client.config, "BGG_MAX_ATTEMPTS", 1)

    with pytest.raises(BggUnavailableError):
        anyio.run(partial(search_board_games, client, query="cat"))


def test_bgg_search_raises_for_malformed_xml():
    """XML mal formado se traduce a excepción de dominio."""
    client = _bgg_client(200, "<items>")

    with pytest.raises(BggUnavailableError):
        anyio.run(partial(search_board_games, client, query="cat"))


def test_bgg_search_wraps_http_errors():
    """Errores de transporte HTTP no escapan del cliente BGG."""
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = httpx.TimeoutException("timeout")

    with pytest.raises(BggUnavailableError):
        anyio.run(partial(search_board_games, client, query="cat"))


def test_bgg_search_rejects_empty_attempt_budget(monkeypatch):
    """Un presupuesto de reintentos vacío no hace llamadas externas."""
    client = _bgg_client(200, "<items />")
    monkeypatch.setattr(bgg_client.config, "BGG_MAX_ATTEMPTS", 0)

    with pytest.raises(BggUnavailableError):
        anyio.run(partial(search_board_games, client, query="cat"))

    client.get.assert_not_called()


def _bgg_client(*responses):
    """Construye un cliente HTTP falso con respuestas XML."""
    normalized = [
        response if isinstance(response, tuple) else (response, responses[index + 1])
        for index, response in enumerate(responses)
        if not isinstance(response, str)
    ]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get.side_effect = [
        httpx.Response(status_code, text=text)
        for status_code, text in normalized
    ]
    return client
