"""Explicación cacheada de un juego, generada apartado a apartado por huella."""

from uuid import UUID

import httpx
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth.service import AuthenticatedSession
from api.games import repository
from api.games.schemas import GameExplanationResponse
from api.locks import advisory_session_lock
from api.manuals.exceptions import ManualContextNotFoundError
from api.manuals.retrieval.service import generate_game_answer
from database.models.explanation import GameExplanation

EXPLANATION_TOP_K = 5
# Orden de prioridad: el resumen primero (lo único visible de entrada) y luego
# los apartados de los acordeones. Se genera uno por petición para que el
# resumen llegue cuanto antes mientras el resto se completa en segundo plano.
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
    client: httpx.AsyncClient,
) -> GameExplanationResponse:
    """Devuelve la explicación, generando el siguiente apartado que falte.

    La huella del pool visible se compara al leer: añadir, borrar, editar o
    re-procesar un manual la cambia, así que la caché se invalida sola y se
    regenera desde el resumen sin enganches en los flujos de escritura.
    """
    # Copia plana ANTES del rollback que suelta la transacción de lectura.
    user_id = auth.user.id
    await repository.get_game_for_detail(session, game_id=game_id)
    fingerprint = await repository.get_pool_fingerprint(
        session,
        game_id=game_id,
        current_user_id=user_id,
    )
    if fingerprint is None:
        raise ManualContextNotFoundError

    cached = await repository.get_game_explanation(
        session,
        user_id=user_id,
        game_id=game_id,
    )
    if _is_complete(cached, fingerprint):
        return _ready_response(cached)

    # Suelta la transacción de lectura antes de la generación lenta.
    await session.rollback()
    return await _generate_next_section(user_id=user_id, game_id=game_id, client=client)


async def _generate_next_section(
    *,
    user_id: UUID,
    game_id: UUID,
    client: httpx.AsyncClient,
) -> GameExplanationResponse:
    """Genera el siguiente apartado pendiente bajo lock (evita estampida de LLM)."""
    lock_key = f"explanation:{user_id}:{game_id}"
    async with advisory_session_lock(lock_key) as session:
        if session is None:
            # Otra petición ya está generando: el front reintenta y recoge avance.
            return GameExplanationResponse(status="generating", sections=None, generated_at=None)

        # La huella se recalcula DENTRO del lock: el pool pudo cambiar mientras
        # esperábamos, y es esta huella la que decide qué hay hecho y qué falta.
        fingerprint = await repository.get_pool_fingerprint(
            session,
            game_id=game_id,
            current_user_id=user_id,
        )
        if fingerprint is None:
            # El pool quedó vacío durante la espera; el siguiente sondeo dará 404.
            return GameExplanationResponse(status="generating", sections=None, generated_at=None)

        cached = await repository.get_game_explanation(
            session,
            user_id=user_id,
            game_id=game_id,
        )
        if _is_complete(cached, fingerprint):
            return _ready_response(cached)

        sections = _sections_for(cached, fingerprint)
        # _is_complete era falso, así que siempre queda al menos un apartado.
        next_key, *rest = [key for key in EXPLANATION_QUESTIONS if key not in sections]
        answer = await generate_game_answer(
            session,
            current_user_id=user_id,
            game_id=game_id,
            question=EXPLANATION_QUESTIONS[next_key],
            top_k=EXPLANATION_TOP_K,
            client=client,
        )
        sections[next_key] = {
            "answer": answer.answer,
            "sources": [source.model_dump(mode="json") for source in answer.sources],
        }
        row = await repository.upsert_game_explanation(
            session,
            user_id=user_id,
            game_id=game_id,
            sections=sections,
            source_fingerprint=fingerprint,
        )
        if rest:
            # Aún quedan apartados: devolvemos el avance y el front sigue sondeando.
            return GameExplanationResponse(
                status="generating", sections=sections, generated_at=None
            )
        return _ready_response(row)


def _is_complete(explanation: GameExplanation | Row | None, fingerprint: str) -> bool:
    """True si la caché vale para esta huella y tiene ya los cuatro apartados."""
    return (
        explanation is not None
        and explanation.source_fingerprint == fingerprint
        and all(key in explanation.sections for key in EXPLANATION_QUESTIONS)
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
