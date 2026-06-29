"""Explicación cacheada de un juego, generada por Celery."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from api import config
from api.auth.service import AuthenticatedSession
from api.exceptions import InternalServiceError, InternalServiceUnavailableError
from api.games import repository
from api.games.dto import (
    GameExplanationJob,
    GameExplanationOutcome,
    GameExplanationSnapshot,
)
from api.games.schemas import ExplanationSection, GameExplanationResponse
from api.locks import advisory_session_lock
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.retrieval.service import generate_game_answer
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
    if cached is not None:
        if _is_ready(cached, fingerprint):
            return GameExplanationOutcome(snapshot=cached, job=None)
        if _is_failed(cached, fingerprint):
            return GameExplanationOutcome(snapshot=cached, job=None)
        if _is_generating_fresh(cached, fingerprint):
            return GameExplanationOutcome(snapshot=cached, job=None)

    sections = _sections_for(cached, fingerprint)
    snapshot = await repository.mark_game_explanation_generating(
        session,
        user_id=user_id,
        game_id=game_id,
        sections=sections,
        source_fingerprint=fingerprint,
    )
    return GameExplanationOutcome(
        snapshot=snapshot,
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
        if cached is not None and _is_ready(cached, fingerprint):
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


def build_game_explanation_response(
    snapshot: GameExplanationSnapshot,
) -> GameExplanationResponse:
    """Construye la respuesta pública desde el snapshot interno."""
    if snapshot.status == "ready":
        return _ready_response(snapshot)
    if snapshot.status == "failed":
        return _failed_response(snapshot)
    return _generating_response(snapshot)


def _is_ready(explanation: GameExplanationSnapshot, fingerprint: str) -> bool:
    """True si la caché vale para esta huella y tiene los cuatro apartados."""
    return (
        explanation.source_fingerprint == fingerprint
        and explanation.status == "ready"
        and all(key in explanation.sections for key in EXPLANATION_QUESTIONS)
    )


def _is_failed(explanation: GameExplanationSnapshot, fingerprint: str) -> bool:
    """True si el último intento para esta huella acabó en error."""
    return (
        explanation.source_fingerprint == fingerprint
        and explanation.status == "failed"
    )


def _is_generating_fresh(explanation: GameExplanationSnapshot, fingerprint: str) -> bool:
    """True si ya hay una generación reciente y el polling no debe reencolar."""
    if (
        explanation.source_fingerprint != fingerprint
        or explanation.status != "generating"
    ):
        return False
    updated_at = explanation.updated_at
    return (
        isinstance(updated_at, datetime)
        and datetime.now(UTC) - updated_at < GENERATION_STALE_AFTER
    )


def _sections_for(
    explanation: GameExplanationSnapshot | None,
    fingerprint: str,
) -> dict[str, object]:
    """Apartados ya generados para esta huella; vacío si la caché es de otra."""
    if explanation is not None and explanation.source_fingerprint == fingerprint:
        return dict(explanation.sections)
    return {}


def _ready_response(explanation: GameExplanationSnapshot) -> GameExplanationResponse:
    """Convierte la fila cacheada completa en el contrato público."""
    return GameExplanationResponse(
        status="ready",
        sections=_response_sections(explanation.sections),
        generated_at=explanation.generated_at,
    )


def _generating_response(explanation: GameExplanationSnapshot) -> GameExplanationResponse:
    """Devuelve el estado intermedio mientras el worker completa apartados."""
    return GameExplanationResponse(
        status="generating",
        sections=_response_sections(explanation.sections),
        generated_at=None,
    )


def _failed_response(explanation: GameExplanationSnapshot) -> GameExplanationResponse:
    """Devuelve el último fallo conocido de generación."""
    return GameExplanationResponse(
        status="failed",
        sections=_response_sections(explanation.sections),
        generated_at=None,
        error_code=explanation.error_code or "generation_failed",
    )


def _response_sections(
    sections: dict[str, object],
) -> dict[str, ExplanationSection] | None:
    """Valida las secciones JSONB para la API."""
    if not sections:
        return None
    return {
        key: ExplanationSection.model_validate(section)
        for key, section in sections.items()
    }
