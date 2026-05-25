"""Type aliases reutilizados por endpoints y schemas del servicio LLM."""

from typing import Annotated

import httpx
from fastapi import Depends
from pydantic import Field

from llm.dependencies import get_http_client

# Dependencias FastAPI compartidas por los endpoints.
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]

# Restricciones de validación reutilizadas entre schemas.
Question = Annotated[str, Field(min_length=1)]
ContextChunks = Annotated[list[str], Field(min_length=1)]
Answer = Annotated[str, Field(min_length=1)]
