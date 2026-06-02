"""Type aliases reutilizados por endpoints y schemas del gateway."""

from typing import Annotated

import httpx
from fastapi import Depends, File, UploadFile
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_http_client
from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from database.session import get_db_session

# Dependencias FastAPI compartidas por los routers.
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]
ImageUpload = Annotated[UploadFile, File()]

# Restricciones de validación reutilizadas entre schemas.
Question = Annotated[str, Field(min_length=1)]
Answer = Annotated[str, Field(min_length=1, max_length=MESSAGE_CONTENT_MAX_LENGTH)]
ChunksIndexed = Annotated[int, Field(ge=0)]
