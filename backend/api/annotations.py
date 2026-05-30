"""Type aliases reutilizados por endpoints y schemas del gateway."""

from typing import Annotated

import httpx
from fastapi import Depends, File, Form, UploadFile
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_http_client
from database.session import get_db_session

# Dependencias FastAPI compartidas por los routers.
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]
ImageUpload = Annotated[UploadFile, File()]
ManualName = Annotated[str, Form(min_length=1)]

# Restricciones de validación reutilizadas entre schemas.
Question = Annotated[str, Field(min_length=1)]
Answer = Annotated[str, Field(min_length=1)]
ManualSlug = Annotated[str, Field(min_length=1)]
ChunksIndexed = Annotated[int, Field(ge=0)]
