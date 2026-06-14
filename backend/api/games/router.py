"""Endpoints del catálogo local de juegos."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request

from api import config
from api.annotations import DbSession, HttpClient
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.games.dependencies import ValidGameId
from api.games.explanations import get_game_explanation
from api.games.schemas import (
    GAME_SEARCH_LIMIT_DEFAULT,
    GAME_SEARCH_LIMIT_MAX,
    GAME_SEARCH_QUERY_MAX_LENGTH,
    CreateGameRequest,
    GameDetailResponse,
    GameExplanationResponse,
    GameSearchItem,
    GameSearchResponse,
    MyGamesResponse,
)
from api.games.service import (
    create_manual_game,
    get_game_detail,
    list_my_games,
    search_game_catalog,
)
from api.manuals.retrieval.service import generate_game_answer
from api.manuals.schemas import AnswerResponse, GameQuestionRequest
from api.rate_limit import limiter
from api.responses import (
    GAME_NOT_FOUND_RESPONSE,
    GENERATED_ANSWER_TOO_LONG_RESPONSE,
    INTERNAL_ERROR_RESPONSE,
    INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    MANUAL_CONTEXT_NOT_FOUND_RESPONSE,
)

router = APIRouter()

GameSearchQuery = Annotated[str, Query(min_length=1, max_length=GAME_SEARCH_QUERY_MAX_LENGTH)]
GameSearchLimit = Annotated[int, Query(ge=1, le=GAME_SEARCH_LIMIT_MAX)]
MyGamesLimit = Annotated[int, Query(ge=1, le=100)]
MyGamesOffset = Annotated[int, Query(ge=0)]


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


@router.post("/api/games", status_code=201)
@limiter.limit(config.GAME_CREATE_RATE_LIMIT)
async def create_game_handler(
    request: Request,
    auth: CurrentAuth,
    payload: CreateGameRequest,
    session: DbSession,
    _csrf: CsrfProtection,
) -> GameSearchItem:
    """Da de alta un juego ausente de BGG para poder subirle un manual."""
    return await create_manual_game(
        session,
        name=payload.name,
        created_by_user_id=auth.user.id,
    )


# Va antes de la ruta `/{game_id}`: si no, FastAPI intentaría leer `mine` como un UUID.
@router.get("/api/games/mine")
async def list_my_games_handler(
    auth: CurrentAuth,
    session: DbSession,
    limit: MyGamesLimit = 50,
    offset: MyGamesOffset = 0,
) -> MyGamesResponse:
    """Lista los juegos con los que el usuario ha interactuado, por actividad reciente."""
    return await list_my_games(session, user_id=auth.user.id, limit=limit, offset=offset)


@router.get(
    "/api/games/{game_id}",
    responses=GAME_NOT_FOUND_RESPONSE,
)
async def get_game_detail_handler(
    auth: CurrentAuth,
    game_id: UUID,
    session: DbSession,
    client: HttpClient,
) -> GameDetailResponse:
    """Devuelve el hub de un juego; uno oculto se sirve en solo lectura."""
    return await get_game_detail(
        session,
        auth=auth,
        game_id=game_id,
        client=client,
    )


@router.get(
    "/api/games/{game_id}/explanation",
    responses={
        **GAME_NOT_FOUND_RESPONSE,
        **MANUAL_CONTEXT_NOT_FOUND_RESPONSE,
        **INTERNAL_ERROR_RESPONSE,
        **INTERNAL_SERVICE_UNAVAILABLE_RESPONSE,
    },
)
@limiter.limit(config.EXPLANATION_RATE_LIMIT)
async def get_game_explanation_handler(
    request: Request,
    auth: CurrentAuth,
    game_id: UUID,
    session: DbSession,
    client: HttpClient,
) -> GameExplanationResponse:
    """Sirve la explicación del juego, regenerándola si el pool cambió."""
    return await get_game_explanation(
        session,
        auth=auth,
        game_id=game_id,
        client=client,
    )


@router.post(
    "/api/games/{game_id}/questions",
    responses={
        **GAME_NOT_FOUND_RESPONSE,
        **GENERATED_ANSWER_TOO_LONG_RESPONSE,
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
    return await generate_game_answer(
        session,
        current_user_id=auth.user.id,
        game_id=game_id,
        question=payload.question,
        top_k=payload.top_k,
        client=client,
    )
