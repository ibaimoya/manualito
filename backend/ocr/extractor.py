from paddleocr import PaddleOCR

_ocr = PaddleOCR(
    use_textline_orientation=True,
    lang='es',
    enable_mkldnn=False,
    device='cpu',
)


def extract_text(image_path: str) -> list[dict]:
    """
    Extrae las líneas de texto reconocidas en una imagen.

    Procesa la imagen indicada mediante el motor PaddleOCR y transforma la
    salida interna en una lista normalizada de líneas con su puntuación de
    confianza redondeada a cuatro decimales.

    Args:
        image_path (str): Ruta absoluta o relativa al fichero de imagen a procesar.
                          Formatos soportados: JPEG, PNG, BMP, entre otros.

    Returns:
        list[dict]: Lista de diccionarios, uno por línea reconocida, con las claves:
                    - 'text' (str): Texto reconocido en la línea.
                    - 'confidence' (float): Puntuación de confianza del modelo en el
                      rango [0.0, 1.0], redondeada a cuatro decimales.
    """
    result = _ocr.predict(image_path)

    lines = []
    for res in result:
        for text, score in zip(res['rec_texts'], res['rec_scores']):
            lines.append({'text': text, 'confidence': round(float(score), 4)})

    return lines
