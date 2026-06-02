"""Dependencias FastAPI reutilizables del catálogo de juegos."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Form, Path

from api.annotations import DbSession
from api.games.repository import ensure_active_game

GameIdPath = Annotated[UUID, Path()]
GameIdForm = Annotated[UUID, Form()]


async def valid_game_id(
    game_id: GameIdPath,
    session: DbSession,
) -> UUID:
    """Valida que el juego de la ruta existe y está activo."""
    await ensure_active_game(session, game_id=game_id)
    return game_id


async def valid_game_form_id(
    game_id: GameIdForm,
    session: DbSession,
) -> UUID:
    """Valida que el juego del formulario existe y está activo."""
    await ensure_active_game(session, game_id=game_id)
    return game_id


ValidGameId = Annotated[UUID, Depends(valid_game_id)]
ValidGameFormId = Annotated[UUID, Depends(valid_game_form_id)]
