from collections.abc import Collection
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
    GameExplanationPool,
    GameExplanationSnapshot,
)
from api.games.schemas import ExplanationSection, GameExplanationResponse
from api.locks import advisory_session_lock
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.retrieval.service import generate_game_answer
from database.session import get_sessionmaker

EXPLANATION_TOP_K = 5
GENERATION_STALE_AFTER = timedelta(seconds=config.CELERY_GPU_HARD_TIME_LIMIT + 30)
EXPLANATION_QUESTIONS = {
    "summary": "Resume en dos frases de qué va este juego.",
    "setup": "Explica la preparación inicial del juego paso a paso.",
    "turns": "Explica cómo es un turno: sus fases y qué puede hacer un jugador.",
    "victory": "Explica cómo se gana la partida y cómo se resuelven los empates.",
}


async def get_game_explanation(
    session: AsyncSession, *, auth: AuthenticatedSession, game_id: UUID
) -> GameExplanationOutcome:
    user_id = auth.user.id
    await repository.get_game_for_detail(session, game_id=game_id)
    pool = await repository.get_explanation_pool(session, game_id=game_id, current_user_id=user_id)
    if pool is None:
        raise ManualContextNotFoundError
    await repository.lock_game_explanation(
        session, game_id=game_id, source_fingerprint=pool.source_fingerprint
    )
    cached = await repository.get_game_explanation(
        session, game_id=game_id, source_fingerprint=pool.source_fingerprint
    )
    if cached is not None and _use_cached_explanation(cached):
        await session.commit()
        return GameExplanationOutcome(cached, None, pool.owned_manual_ids)

    snapshot = await repository.save_game_explanation(
        session,
        game_id=game_id,
        source_fingerprint=pool.source_fingerprint,
        sections=dict(cached.sections) if cached else {},
        status="generating",
    )
    job = GameExplanationJob(user_id, game_id, pool.source_fingerprint)
    return GameExplanationOutcome(snapshot, job, pool.owned_manual_ids)


async def generate_game_explanation(user_id: UUID, game_id: UUID, source_fingerprint: str) -> bool:
    job = GameExplanationJob(user_id, game_id, source_fingerprint)
    async with advisory_session_lock(f"game-explanation:{game_id}:{source_fingerprint}") as session:
        if session is None:
            return False
        cached = await repository.get_game_explanation(
            session, game_id=game_id, source_fingerprint=source_fingerprint
        )
        if cached is None or cached.status != "generating":
            return True
        pool = await repository.get_explanation_pool(
            session, game_id=game_id, current_user_id=user_id
        )
        try:
            if pool is None or pool.source_fingerprint != source_fingerprint:
                raise ManualContextNotFoundError
            await _generate_sections(session, job, pool, dict(cached.sections))
        except ManualContextNotFoundError:
            await repository.discard_pending_explanation(
                session, game_id=game_id, source_fingerprint=source_fingerprint
            )
        except (InternalServiceError, InternalServiceUnavailableError):
            await repository.mark_game_explanation_failed(
                session,
                game_id=game_id,
                source_fingerprint=source_fingerprint,
                error_code="generation_failed",
            )
        return True


async def _generate_sections(
    session: AsyncSession,
    job: GameExplanationJob,
    pool: GameExplanationPool,
    sections: dict[str, object],
) -> None:
    async with httpx.AsyncClient(timeout=config.INTERNAL_JSON_TIMEOUT) as client:
        for key, question in EXPLANATION_QUESTIONS.items():
            if key in sections:
                continue
            await _require_unchanged_pool(session, job)
            answer = await generate_game_answer(
                session,
                current_user_id=job.user_id,
                game_id=job.game_id,
                question=question,
                top_k=EXPLANATION_TOP_K,
                client=client,
                language="es",
                allowed_manual_ids=pool.manual_ids,
            )
            await _require_unchanged_pool(session, job)
            sections[key] = {
                "answer": answer.answer,
                "sources": [
                    source.model_dump(mode="json", exclude={"is_own"}) for source in answer.sources
                ],
            }
            if not _has_all_sections(sections):
                await repository.save_game_explanation(
                    session,
                    game_id=job.game_id,
                    source_fingerprint=job.source_fingerprint,
                    sections=sections,
                    status="generating",
                )
    await repository.save_game_explanation(
        session,
        game_id=job.game_id,
        source_fingerprint=job.source_fingerprint,
        sections=sections,
        status="ready",
    )


async def _require_unchanged_pool(session: AsyncSession, job: GameExplanationJob) -> None:
    pool = await repository.get_explanation_pool(
        session, game_id=job.game_id, current_user_id=job.user_id
    )
    await session.rollback()
    if pool is None or pool.source_fingerprint != job.source_fingerprint:
        raise ManualContextNotFoundError


async def fail_game_explanation(game_id: UUID, source_fingerprint: str, error_code: str) -> None:
    async with get_sessionmaker()() as session:
        await repository.mark_game_explanation_failed(
            session,
            game_id=game_id,
            source_fingerprint=source_fingerprint,
            error_code=error_code,
        )


def _has_all_sections(sections: dict[str, object]) -> bool:
    return all(key in sections for key in EXPLANATION_QUESTIONS)


def _use_cached_explanation(explanation: GameExplanationSnapshot) -> bool:
    if explanation.status == "ready":
        return _has_all_sections(explanation.sections)
    if explanation.status == "generating":
        return datetime.now(UTC) - explanation.updated_at < GENERATION_STALE_AFTER
    return explanation.status == "failed"


def build_game_explanation_response(
    snapshot: GameExplanationSnapshot, owned_manual_ids: Collection[UUID]
) -> GameExplanationResponse:
    sections = {}
    for key, value in snapshot.sections.items():
        section = ExplanationSection.model_validate(value)
        for source in section.sources:
            source.is_own = source.manual_id in owned_manual_ids
        sections[key] = section
    return GameExplanationResponse(
        status=snapshot.status,
        sections=sections or None,
        generated_at=snapshot.generated_at if snapshot.status == "ready" else None,
        error_code=snapshot.error_code,
    )
