"""Schemas Pydantic del servicio RAG."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from rag.annotations import (
    ChunksIndexed,
    ManualId,
    NonEmptyText,
    Question,
    SourcePage,
    TopK,
)


class IngestChunk(BaseModel):
    """Chunk preparado por API y persistido previamente en Postgres."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    text: NonEmptyText
    chunk_index: int = Field(ge=0)
    source_page: SourcePage
    content_hash: str = Field(min_length=64, max_length=64)


class IngestRequest(BaseModel):
    """Petición de indexado: RAG no trocea ni decide IDs."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    game_id: str = Field(min_length=1)
    owner_user_id: str = Field(min_length=1)
    language: str | None = None
    chunks: list[IngestChunk] = Field(min_length=1)


class RetrieveRequest(BaseModel):
    """Petición de recuperación de candidatos por juego."""

    model_config = ConfigDict(extra="forbid")

    game_id: str = Field(min_length=1)
    question: Question
    top_k: TopK = 10


class DeleteRequest(BaseModel):
    """Petición interna para borrar chunks derivados de un manual."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    chunk_ids: list[str] = Field(default_factory=list)


class IngestResponse(BaseModel):
    """Respuesta de ``POST /ingest`` tras sincronizar Chroma."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    chunks_indexed: ChunksIndexed
    status: str
    embedding_model: str
    indexed_at: str
    chunk_ids: list[str]


class RetrievedChunk(BaseModel):
    """Candidato recuperado de Chroma, sin texto canónico."""

    model_config = ConfigDict(extra="forbid")

    id: str
    chunk_index: int
    source_page: int
    score: float


class RetrieveResponse(BaseModel):
    """Respuesta de ``POST /retrieve`` con candidatos rehidratables."""

    model_config = ConfigDict(extra="forbid")

    chunks: list[RetrievedChunk]


class DeleteResponse(BaseModel):
    """Respuesta tras limpiar de Chroma los chunks de un manual."""

    model_config = ConfigDict(extra="forbid")

    manual_id: ManualId
    chunks_deleted: int = Field(ge=0)
    status: str
