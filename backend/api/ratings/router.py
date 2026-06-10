"""Endpoints de valoraciones de juegos."""

from uuid import UUID

from fastapi import APIRouter, Request, status

from api import config
from api.annotations import DbSession
from api.auth.dependencies import CsrfProtection, CurrentAuth
from api.games.dependencies import ValidGameId
from api.rate_limit import limiter
from api.ratings.repository import delete_user_rating, upsert_user_rating
from api.ratings.schemas import RateGameRequest, RatingResponse
from api.responses import GAME_NOT_FOUND_RESPONSE, RATING_NOT_FOUND_RESPONSE

router = APIRouter()


@router.put(
    "/api/games/{game_id}/rating",
    responses=GAME_NOT_FOUND_RESPONSE,
)
@limiter.limit(config.RATING_RATE_LIMIT)
async def rate_game_handler(
    request: Request,
    auth: CurrentAuth,
    game_id: ValidGameId,
    payload: RateGameRequest,
    session: DbSession,
    _csrf: CsrfProtection,
) -> RatingResponse:
    """Crea o actualiza la valoración propia de un juego activo."""
    row = await upsert_user_rating(
        session,
        user_id=auth.user.id,
        game_id=game_id,
        score=payload.score,
        note=payload.note,
    )
    return RatingResponse.model_validate(row)


@router.delete(
    "/api/games/{game_id}/rating",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=RATING_NOT_FOUND_RESPONSE,
)
async def delete_rating_handler(
    game_id: UUID,
    session: DbSession,
    auth: CurrentAuth,
    _csrf: CsrfProtection,
) -> None:
    """Quita la valoración propia aunque el juego ya no esté activo."""
    await delete_user_rating(
        session,
        user_id=auth.user.id,
        game_id=game_id,
    )
