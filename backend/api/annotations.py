"""Alias de tipos reutilizados por los endpoints y contratos del gateway."""

from typing import Annotated

import httpx
from fastapi import Depends
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.dependencies import get_accept_language, get_http_client
from common.conversation_limits import MESSAGE_CONTENT_MAX_LENGTH
from common.language import Language
from database.session import get_db_session

DbSession = Annotated[AsyncSession, Depends(get_db_session)]
HttpClient = Annotated[httpx.AsyncClient, Depends(get_http_client)]
AcceptLanguage = Annotated[Language | None, Depends(get_accept_language)]

Question = Annotated[str, Field(min_length=1)]
Answer = Annotated[str, Field(min_length=1, max_length=MESSAGE_CONTENT_MAX_LENGTH)]
ChunksIndexed = Annotated[int, Field(ge=0)]
