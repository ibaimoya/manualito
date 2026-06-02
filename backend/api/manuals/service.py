"""Casos de uso de manuales persistidos."""

import logging
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import httpx
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from api import client as internal_client
from api import config
from api.auth.service import AuthenticatedSession
from api.exceptions import ApiError, InternalServiceError
from api.manuals.exceptions import ManualWithoutTextError
from api.manuals.repository import (
    DeletedManualAssets,
    PersistedManual,
    PreparedChunk,
    create_manual_with_page_and_chunks,
    mark_manual_failed,
    mark_manual_indexed,
    soft_delete_user_manual,
)
from api.manuals.schemas import ManualCreatedResponse
from api.manuals.storage import delete_stored_file, save_manual_image
from api.manuals.validation import validate_manual_image
from api.ocr.service import run_ocr
from common.crypto import sha256_hex
from common.logging import safe_for_log
from common.manual_text.chunking import chunk_text
from common.manual_text.normalizer import normalize_ocr_lines

DEFAULT_SOURCE_PAGE = 1
RAG_INDEX_INTERNAL_DETAIL = "Error interno al indexar el manual."

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RagIngestResult:
    """Respuesta validada de RAG tras indexar un manual."""

    chunks_indexed: int
    embedding_model: str
    indexed_at: datetime
    chunk_ids: set[UUID]


async def create_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    game_id: UUID,
    title: str | None,
    visibility: str,
    language: str | None,
    image: UploadFile,
    client: httpx.AsyncClient,
) -> ManualCreatedResponse:
    """Persiste un manual en Postgres y después lo indexa en Chroma."""
    validated_image = await validate_manual_image(image)
    ocr_lines = await run_ocr(filename=image.filename, image=validated_image, client=client)
    prepared_chunks = _prepare_chunks(ocr_lines)
    storage_key = await save_manual_image(validated_image, owner_user_id=auth.user.id)

    try:
        persisted = await create_manual_with_page_and_chunks(
            session,
            owner_user_id=auth.user.id,
            game_id=game_id,
            title=_optional_strip(title),
            visibility=visibility,
            language=_optional_strip(language),
            image=validated_image,
            storage_key=storage_key,
            ocr_lines=ocr_lines,
            chunks=prepared_chunks,
        )
    except Exception:
        # El fichero ya existe; se limpia ante cualquier fallo de persistencia.
        await delete_stored_file(storage_key)
        raise

    try:
        ingest_result = _parse_rag_ingest_response(
            await _index_manual_in_rag(
                client=client,
                auth=auth,
                persisted=persisted,
                game_id=game_id,
                language=_optional_strip(language),
            )
        )
    except ApiError:
        await mark_manual_failed(session, manual_id=persisted.manual.id)
        raise
    except (KeyError, TypeError, ValueError) as ingest_err:
        await mark_manual_failed(session, manual_id=persisted.manual.id)
        raise InternalServiceError(RAG_INDEX_INTERNAL_DETAIL) from ingest_err
    except Exception as ingest_err:
        await mark_manual_failed(session, manual_id=persisted.manual.id)
        logger.exception(
            "RAG fallo de forma inesperada al indexar manual '%s'.",
            safe_for_log(str(persisted.manual.id)),
        )
        raise InternalServiceError(RAG_INDEX_INTERNAL_DETAIL) from ingest_err

    await mark_manual_indexed(
        session,
        manual_id=persisted.manual.id,
        chunk_ids=ingest_result.chunk_ids,
        embedding_model=ingest_result.embedding_model,
        indexed_at=ingest_result.indexed_at,
    )
    return ManualCreatedResponse(
        manual_id=persisted.manual.id,
        game_id=game_id,
        status="active",
        visibility=visibility,
        chunks_indexed=ingest_result.chunks_indexed,
        ocr_lines=ocr_lines,
    )


def _parse_rag_ingest_response(response: dict) -> RagIngestResult:
    """Valida los campos mínimos que API necesita de RAG."""
    return RagIngestResult(
        chunks_indexed=int(response["chunks_indexed"]),
        embedding_model=str(response["embedding_model"]),
        indexed_at=datetime.fromisoformat(str(response["indexed_at"])),
        chunk_ids={UUID(chunk_id) for chunk_id in response["chunk_ids"]},
    )


async def delete_manual(
    session: AsyncSession,
    *,
    auth: AuthenticatedSession,
    manual_id: UUID,
    client: httpx.AsyncClient,
) -> None:
    """Borra un manual propio de Postgres y limpia recursos derivados."""
    deleted = await soft_delete_user_manual(
        session,
        owner_user_id=auth.user.id,
        manual_id=manual_id,
    )
    for storage_key in deleted.storage_keys:
        if not await delete_stored_file(storage_key):
            logger.warning(
                "No se pudo borrar un fichero físico del manual '%s'.",
                safe_for_log(str(manual_id)),
            )
    await _delete_manual_from_rag(client=client, deleted=deleted)


def _prepare_chunks(ocr_lines: list[dict[str, object]]) -> list[PreparedChunk]:
    """Normaliza OCR y genera chunks persistibles."""
    text = normalize_ocr_lines(ocr_lines)
    chunks = chunk_text(text)
    if not chunks:
        raise ManualWithoutTextError
    return [
        PreparedChunk(
            text=chunk,
            chunk_index=index,
            source_page=DEFAULT_SOURCE_PAGE,
            content_hash=sha256_hex(chunk),
        )
        for index, chunk in enumerate(chunks)
    ]


async def _index_manual_in_rag(
    *,
    client: httpx.AsyncClient,
    auth: AuthenticatedSession,
    persisted: PersistedManual,
    game_id: UUID,
    language: str | None,
) -> dict:
    """Envía a RAG solo chunks ya persistidos en Postgres."""
    return await internal_client.post_json(
        client=client,
        service_name="RAG",
        url=f"{config.RAG_URL}/ingest",
        payload={
            "manual_id": str(persisted.manual.id),
            "game_id": str(game_id),
            "owner_user_id": str(auth.user.id),
            "language": language,
            "chunks": [
                {
                    "id": str(chunk.id),
                    "text": chunk.text,
                    "chunk_index": chunk.chunk_index,
                    "source_page": chunk.source_page,
                    "content_hash": chunk.content_hash,
                }
                for chunk in persisted.chunks
            ],
        },
        unavailable_detail="Servicio RAG no disponible.",
        internal_detail=RAG_INDEX_INTERNAL_DETAIL,
    )


async def _delete_manual_from_rag(
    *,
    client: httpx.AsyncClient,
    deleted: DeletedManualAssets,
) -> None:
    """Pide a RAG limpiar Chroma sin bloquear el borrado de Postgres."""
    try:
        await internal_client.post_json(
            client=client,
            service_name="RAG",
            url=f"{config.RAG_URL}/delete",
            payload={
                "manual_id": str(deleted.manual_id),
                "chunk_ids": [str(chunk_id) for chunk_id in deleted.chunk_ids],
            },
            unavailable_detail="Servicio RAG no disponible.",
            internal_detail="Error interno al borrar el manual del índice.",
        )
    except Exception:
        # Postgres ya marcó el borrado; la limpieza de Chroma se puede reintentar.
        logger.warning(
            "No se pudo limpiar Chroma para manual '%s'.",
            safe_for_log(str(deleted.manual_id)),
            exc_info=True,
        )


def _optional_strip(value: str | None) -> str | None:
    """Normaliza campos opcionales de formulario."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
