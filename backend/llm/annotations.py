"""Type aliases reutilizados por endpoints y schemas del servicio LLM."""

from typing import Annotated

import httpx
from fastapi import Depends
from pydantic import Field

from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from llm.dependencies import get_http_client

# Dependencias FastAPI compartidas por los endpoints.
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]

# Restricciones de validación reutilizadas entre schemas.
Question = Annotated[str, Field(min_length=1)]
ContextChunks = Annotated[list[str], Field(min_length=1)]
Answer = Annotated[str, Field(min_length=1, max_length=MESSAGE_CONTENT_MAX_LENGTH)]
ConversationTitle = Annotated[str, Field(min_length=1, max_length=80)]
ConversationTitleGameName = Annotated[str, Field(min_length=1, max_length=120)]
