"""Explicación cacheada de un juego, generada por Celery."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.auth.service import AuthenticatedSession
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.games import repository
from api.games.schemas import GameExplanationResponse
from api.locks import advisory_session_lock
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.retrieval.service import generate_game_answer
from database.models.explanation import GameExplanation
from database.session import get_sessionmaker

EXPLANATION_TOP_K = 5
GENERATION_STALE_AFTER = timedelta(seconds=config.CELERY_GPU_HARD_TIME_LIMIT + 30)
# Orden de generación: el resumen primero y después los acordeones.
EXPLANATION_QUESTIONS = {
    "summary": "Resume en dos frases de qué va este juego.",
    "setup": "Explica la preparación inicial del juego paso a paso.",
    "turns": "Explica cómo es un turno: sus fases y qué puede hacer un jugador.",
    "victory": "Explica cómo se gana la partida y cómo se resuelven los empates.",
}


@dataclass(frozen=True, slots=True)
class GameExplanationJob:
    """Trabajo opaco para generar la explicación de un juego."""

    user_id: UUID
    game_id: UUID


@dataclass(frozen=True, slots=True)
class GameExplanationOutcome:
    """Respuesta HTTP y trabajo opcional de generación."""

    response: GameExplanationResponse
    job: GameExplanationJob | None


async def get_game_explanation(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
) -> GameExplanationOutcome:
    """Devuelve el estado de explicación y encola generación si falta."""
    user_id = auth.user.id
    await repository.get_game_for_detail(session, game_id=game_id)
    fingerprint = await repository.get_pool_fingerprint(
        session,
        game_id=game_id,
        current_user_id=user_id,
    )
    if fingerprint is None:
        raise ManualContextNotFoundError

    cached = await repository.get_game_explanation(session, user_id=user_id, game_id=game_id)
    if _is_ready(cached, fingerprint):
        return GameExplanationOutcome(response=_ready_response(cached), job=None)
    if _is_failed(cached, fingerprint):
        return GameExplanationOutcome(response=_failed_response(cached), job=None)
    if _is_generating_fresh(cached, fingerprint):
        return GameExplanationOutcome(response=_generating_response(cached), job=None)

    sections = _sections_for(cached, fingerprint)
    row = await repository.mark_game_explanation_generating(
        session,
        user_id=user_id,
        game_id=game_id,
        sections=sections,
        source_fingerprint=fingerprint,
    )
    return GameExplanationOutcome(
        response=_generating_response(row),
        job=GameExplanationJob(user_id=user_id, game_id=game_id),
    )


async def generate_game_explanation(user_id: UUID, game_id: UUID) -> bool:
    """Genera todos los apartados pendientes bajo lock por juego."""
    async with advisory_session_lock(f"game-explanation:{user_id}:{game_id}") as session:
        if session is None:
            return False

        fingerprint = await repository.get_pool_fingerprint(
            session,
            game_id=game_id,
            current_user_id=user_id,
        )
        if fingerprint is None:
            return True

        cached = await repository.get_game_explanation(session, user_id=user_id, game_id=game_id)
        if _is_ready(cached, fingerprint):
            return True

        sections = _sections_for(cached, fingerprint)
        try:
            async with httpx.AsyncClient(timeout=config.INTERNAL_JSON_TIMEOUT) as client:
                for key in EXPLANATION_QUESTIONS:
                    if key in sections:
                        continue
                    answer = await generate_game_answer(
                        session,
                        current_user_id=user_id,
                        game_id=game_id,
                        question=EXPLANATION_QUESTIONS[key],
                        top_k=EXPLANATION_TOP_K,
                        client=client,
                    )
                    sections[key] = {
                        "answer": answer.answer,
                        "sources": [
                            source.model_dump(mode="json") for source in answer.sources
                        ],
                    }
                    if key != "victory":
                        await repository.mark_game_explanation_generating(
                            session,
                            user_id=user_id,
                            game_id=game_id,
                            sections=sections,
                            source_fingerprint=fingerprint,
                        )
            await repository.upsert_game_explanation(
                session,
                user_id=user_id,
                game_id=game_id,
                sections=sections,
                source_fingerprint=fingerprint,
            )
            return True
        except (ManualContextNotFoundError, InternalServiceError, InternalServiceUnavailableError):
            await repository.mark_game_explanation_failed(
                session,
                user_id=user_id,
                game_id=game_id,
                sections=sections,
                source_fingerprint=fingerprint,
                error_code="generation_failed",
            )
            return True


async def fail_game_explanation(user_id: UUID, game_id: UUID, error_code: str) -> None:
    """Marca una explicación como fallida cuando el task agota reintentos."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        fingerprint = await repository.get_pool_fingerprint(
            session,
            game_id=game_id,
            current_user_id=user_id,
        )
        if fingerprint is None:
            return
        cached = await repository.get_game_explanation(session, user_id=user_id, game_id=game_id)
        sections = _sections_for(cached, fingerprint)
        await repository.mark_game_explanation_failed(
            session,
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=fingerprint,
            error_code=error_code,
        )


def _is_ready(explanation: GameExplanation | Row | None, fingerprint: str) -> bool:
    """True si la caché vale para esta huella y tiene los cuatro apartados."""
    return (
        explanation is not None
        and explanation.source_fingerprint == fingerprint
        and getattr(explanation, "status", "ready") == "ready"
        and all(key in explanation.sections for key in EXPLANATION_QUESTIONS)
    )


def _is_failed(explanation: GameExplanation | Row | None, fingerprint: str) -> bool:
    """True si el último intento para esta huella acabó en error."""
    return (
        explanation is not None
        and explanation.source_fingerprint == fingerprint
        and getattr(explanation, "status", "ready") == "failed"
    )


def _is_generating_fresh(explanation: GameExplanation | Row | None, fingerprint: str) -> bool:
    """True si ya hay una generación reciente y el polling no debe reencolar."""
    if (
        explanation is None
        or explanation.source_fingerprint != fingerprint
        or getattr(explanation, "status", "ready") != "generating"
    ):
        return False
    updated_at = getattr(explanation, "updated_at", None)
    return (
        isinstance(updated_at, datetime)
        and datetime.now(UTC) - updated_at < GENERATION_STALE_AFTER
    )


def _sections_for(explanation: GameExplanation | Row | None, fingerprint: str) -> dict[str, object]:
    """Apartados ya generados para esta huella; vacío si la caché es de otra."""
    if explanation is not None and explanation.source_fingerprint == fingerprint:
        return dict(explanation.sections)
    return {}


def _ready_response(explanation: GameExplanation | Row) -> GameExplanationResponse:
    """Convierte la fila cacheada completa en el contrato público."""
    return GameExplanationResponse(
        status="ready",
        sections=explanation.sections,
        generated_at=explanation.generated_at,
    )


def _generating_response(explanation: GameExplanation | Row) -> GameExplanationResponse:
    """Devuelve el estado intermedio mientras el worker completa apartados."""
    sections = dict(explanation.sections)
    return GameExplanationResponse(
        status="generating",
        sections=sections or None,
        generated_at=None,
    )


def _failed_response(explanation: GameExplanation | Row) -> GameExplanationResponse:
    """Devuelve el último fallo conocido de generación."""
    sections = dict(explanation.sections)
    return GameExplanationResponse(
        status="failed",
        sections=sections or None,
        generated_at=None,
        error_code=getattr(explanation, "error_code", None) or "generation_failed",
    )
