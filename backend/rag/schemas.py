"""Schemas Pydantic del servicio RAG."""

from __future__ import annotations

from pydantic import Field

from common.schemas import StrictModel
from rag.annotations import (
    ChunksIndexed,
    ManualId,
    NonEmptyText,
    Question,
    SourcePage,
    TopK,
)


class IngestChunk(StrictModel):
    """Chunk preparado por API y persistido previamente en Postgres."""

    id: str = Field(min_length=1)
    text: NonEmptyText
    chunk_index: int = Field(ge=0)
    source_page: SourcePage
    content_hash: str = Field(min_length=64, max_length=64)


class IngestRequest(StrictModel):
    """Petición de indexado: RAG no trocea ni decide IDs."""

    manual_id: ManualId
    game_id: str = Field(min_length=1)
    owner_user_id: str = Field(min_length=1)
    language: str | None = None
    chunks: list[IngestChunk] = Field(min_length=1)


class RetrieveRequest(StrictModel):
    """Petición de recuperación de candidatos por juego."""

    game_id: str = Field(min_length=1)
    question: Question
    top_k: TopK = 10


class DeleteRequest(StrictModel):
    """Petición interna para borrar chunks derivados de un manual."""

    manual_id: ManualId
    chunk_ids: list[str] = Field(default_factory=list)


class IngestResponse(StrictModel):
    """Respuesta de ``POST /ingest`` tras sincronizar Chroma."""

    manual_id: ManualId
    chunks_indexed: ChunksIndexed
    status: str
    embedding_model: str
    indexed_at: str
    chunk_ids: list[str]


class RetrievedChunk(StrictModel):
    """Candidato recuperado de Chroma, sin texto canónico."""

    id: str
    chunk_index: int
    source_page: int
    score: float


class RetrieveResponse(StrictModel):
    """Respuesta de ``POST /retrieve`` con candidatos rehidratables."""

    chunks: list[RetrievedChunk]


class DeleteResponse(StrictModel):
    """Respuesta tras limpiar de Chroma los chunks de un manual."""

    manual_id: ManualId
    chunks_deleted: int = Field(ge=0)
    status: str
