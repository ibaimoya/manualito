from paddleocr import PaddleOCR

_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(
            use_textline_orientation=True,
            lang='es',
            enable_mkldnn=False,
            device='cpu',
        )
    return _ocr


def extract_text(image_path: str) -> list[dict]:
    ocr = _get_ocr()
    result = ocr.predict(image_path)

    lines = []
    for res in result:
        for text, score in zip(res['rec_texts'], res['rec_scores']):
            lines.append({'text': text, 'confidence': round(float(score), 4)})

    return lines
