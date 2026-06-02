from common.schemas import StrictModel


class OCRLine(StrictModel):
    text: str
    confidence: float


class ExtractResponse(StrictModel):
    lines: list[OCRLine]
