from pydantic import BaseModel


class OCRLine(BaseModel):
    text: str
    confidence: float


class ExtractResponse(BaseModel):
    lines: list[OCRLine]
