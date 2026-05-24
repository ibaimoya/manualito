from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OCRLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1)]
    confidence: float | None = None


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manual_id: Annotated[str, Field(min_length=1)]
    text: str | None = None
    source_page: int | None = Field(default=1, ge=1)
    ocr_lines: list[OCRLine] | None = None

    @model_validator(mode="after")
    def validate_content(self) -> IngestRequest:
        if not self.text and not self.ocr_lines:
            raise ValueError("Se requiere 'text' o 'ocr_lines'.")
        return self


class RetrieveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    manual_id: Annotated[str, Field(min_length=1)]
    question: Annotated[str, Field(min_length=1)]
    top_k: int = Field(default=3, ge=1, le=10)
