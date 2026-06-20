"""Endpoints del catálogo local de juegos."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, status

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
    follow_game,
    get_game_detail,
    list_my_games,
    search_game_catalog,
    unfollow_game,
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
from api.worker.tasks.games import generate_game_explanation_task

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
    """Lista los juegos seguidos por el usuario, por actividad o seguimiento reciente."""
    return await list_my_games(session, user_id=auth.user.id, limit=limit, offset=offset)


@router.get(
    "/api/games/{game_id}",
    responses=GAME_NOT_FOUND_RESPONSE,
)
async def get_game_detail_handler(
    auth: CurrentAuth,
    game_id: UUID,
    session: DbSession,
) -> GameDetailResponse:
    """Devuelve el hub de un juego; uno oculto se sirve en solo lectura."""
    return await get_game_detail(
        session,
        auth=auth,
        game_id=game_id,
    )


@router.post(
    "/api/games/{game_id}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=GAME_NOT_FOUND_RESPONSE,
)
async def follow_game_handler(
    auth: CurrentAuth,
    game_id: ValidGameId,
    session: DbSession,
    _csrf: CsrfProtection,
) -> None:
    """Sigue un juego por decisión explícita del usuario."""
    await follow_game(session, user_id=auth.user.id, game_id=game_id)


@router.delete(
    "/api/games/{game_id}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=GAME_NOT_FOUND_RESPONSE,
)
async def unfollow_game_handler(
    auth: CurrentAuth,
    game_id: ValidGameId,
    session: DbSession,
    _csrf: CsrfProtection,
) -> None:
    """Deja de seguir un juego por decisión explícita del usuario."""
    await unfollow_game(session, user_id=auth.user.id, game_id=game_id)


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
) -> GameExplanationResponse:
    """Sirve el estado de la explicación y encola generación si falta."""
    outcome = await get_game_explanation(
        session,
        auth=auth,
        game_id=game_id,
    )
    if outcome.job is not None:
        generate_game_explanation_task.delay(
            str(outcome.job.user_id),
            str(outcome.job.game_id),
        )
    return outcome.response


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
    """Responde usando el conjunto autorizado de manuales de un juego."""
    return await generate_game_answer(
        session,
        current_user_id=auth.user.id,
        game_id=game_id,
        question=payload.question,
        top_k=payload.top_k,
        client=client,
    )
