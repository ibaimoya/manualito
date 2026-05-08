import logging

from contracts import OcrLine
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)


class PaddleCpuOcrEngine:
    """Motor OCR actual, basado en PaddleOCR con configuración CPU."""

    name = "paddle_cpu"

    def __init__(self):
        """Inicializa PaddleOCR con la configuración histórica del servicio."""
        try:
            self._ocr = PaddleOCR(
                use_textline_orientation=True,
                lang="es",
                enable_mkldnn=False,
                device="cpu",
            )
            logger.info("PaddleOCR CPU inicializado correctamente.")
        except Exception:
            logger.error("Error al inicializar PaddleOCR CPU.", exc_info=True)
            raise

    def extract_text(self, image_path: str) -> list[OcrLine]:
        """
        Extrae las líneas de texto reconocidas en una imagen.

        Procesa la imagen indicada mediante PaddleOCR CPU y transforma
        su salida interna en una lista normalizada de líneas con confianza
        redondeada a cuatro decimales.
        """
        logger.info("Iniciando OCR sobre: %s", image_path)
        result = self._ocr.predict(image_path)

        lines: list[OcrLine] = []
        for res in result:
            for text, score in zip(res["rec_texts"], res["rec_scores"], strict=True):
                lines.append({"text": text, "confidence": round(float(score), 4)})

        if not lines:
            logger.warning("OCR completado sin líneas detectadas: %s", image_path)
        else:
            logger.info("OCR completado: %d líneas detectadas.", len(lines))

        return lines
