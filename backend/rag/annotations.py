"""Type aliases reutilizados por schemas y servicio RAG."""

from typing import Annotated

from pydantic import Field

ManualId = Annotated[str, Field(min_length=1)]
Question = Annotated[str, Field(min_length=1)]
NonEmptyText = Annotated[str, Field(min_length=1)]
ChunksIndexed = Annotated[int, Field(ge=0)]
SourcePage = Annotated[int, Field(ge=1)]

# Límite interno para sobre-recuperar candidatos antes de deduplicar en API.
RAG_RETRIEVAL_TOP_K_MAX = 40
TopK = Annotated[int, Field(ge=1, le=RAG_RETRIEVAL_TOP_K_MAX)]
