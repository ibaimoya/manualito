from functools import cache

from ocr.engines.common import OcrEngine, OcrLine
from ocr.factory import create_ocr_engine


@cache
def get_ocr_engine() -> OcrEngine:
    """
    Devuelve el motor OCR configurado como singleton lazy.

    El resultado queda cacheado para reutilizar la misma instancia durante la
    vida del proceso y evitar recargar modelos OCR en cada petición.
    """
    return create_ocr_engine()


def extract_text(image_path: str) -> list[OcrLine]:
    """
    Extrae las líneas de texto reconocidas en una imagen.

    Mantiene la API pública del módulo mientras delega en el motor OCR
    configurado por la factory.

    Args:
        image_path (str): Ruta absoluta o relativa al fichero de imagen a procesar.

    Returns:
        list[OcrLine]: Lista de líneas OCR normalizadas.

    Raises:
        Exception: Cualquier excepción lanzada por el motor OCR se propaga al
            llamador sin capturar.
    """
    return get_ocr_engine().extract_text(image_path)
