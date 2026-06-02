"""Endpoints del catálogo local de juegos."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from api import config
from api.annotations import DbSession, HttpClient
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.games.dependencies import ValidGameId
from api.games.schemas import (
    GAME_SEARCH_LIMIT_DEFAULT,
    GAME_SEARCH_LIMIT_MAX,
    GAME_SEARCH_QUERY_MAX_LENGTH,
    GameSearchResponse,
)
from api.games.service import search_game_catalog
from api.manuals.retrieval.service import answer_game_question
from api.manuals.schemas import AnswerResponse, GameQuestionRequest
from api.rate_limit import limiter
from api.responses import (
    GAME_NOT_FOUND_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
)

router = APIRouter()

GameSearchQuery = Annotated[str, Query(min_length=1, max_length=GAME_SEARCH_QUERY_MAX_LENGTH)]
GameSearchLimit = Annotated[int, Query(ge=1, le=GAME_SEARCH_LIMIT_MAX)]


@router.get("/api/games")
@limiter.limit(config.GAME_SEARCH_RATE_LIMIT)
async def search_games_handler(
    request: Request,
    q: GameSearchQuery,
    session: DbSession,
    client: HttpClient,
    limit: GameSearchLimit = GAME_SEARCH_LIMIT_DEFAULT,
) -> GameSearchResponse:
    """Busca juegos activos en el catálogo cacheado de Postgres."""
    return await search_game_catalog(session, query=q, limit=limit, client=client)


@router.post(
    "/api/games/{game_id}/questions",
    responses={
        **GAME_NOT_FOUND_RESPONSE,
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
async def answer_game_question_handler(
    auth: CurrentAuth,
    game_id: ValidGameId,
    payload: GameQuestionRequest,
    session: DbSession,
    client: HttpClient,
    _csrf: CsrfProtection,
) -> AnswerResponse:
    """Responde usando el pool autorizado de manuales de un juego."""
    return await answer_game_question(
        session,
        auth=auth,
        game_id=game_id,
        payload=payload,
        client=client,
    )
