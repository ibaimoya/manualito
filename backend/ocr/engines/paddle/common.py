from typing import Any

from contracts import OcrLine


def normalize_paddle_result(result: list[dict[str, Any]]) -> list[OcrLine]:
    """Transforma la salida de PaddleOCR en líneas OCR normalizadas."""
    lines: list[OcrLine] = []
    for res in result:
        for text, score in zip(res["rec_texts"], res["rec_scores"], strict=True):
            lines.append({"text": text, "confidence": round(float(score), 4)})

    return lines
