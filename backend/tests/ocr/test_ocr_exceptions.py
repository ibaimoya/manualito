from ocr.exceptions import OcrError, OcrProcessingError


def test_ocr_exceptions_inherit_from_ocr_error():
    """Todas las excepciones OCR heredan de su base de dominio."""
    assert issubclass(OcrProcessingError, OcrError)
