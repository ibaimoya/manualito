from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: Annotated[str, Field(min_length=1)]
    context_chunks: Annotated[list[str], Field(min_length=1)]
    manual_id: str | None = None
