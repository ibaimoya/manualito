import logging

from contracts import OcrLine


def log_ocr_result(
    logger: logging.Logger,
    image_path: str,
    lines: list[OcrLine],
) -> None:
    """Registra el resultado de una extracción OCR."""
    if not lines:
        logger.warning("OCR completado sin líneas detectadas: %s", image_path)
    else:
        logger.info("OCR completado: %d líneas detectadas.", len(lines))
