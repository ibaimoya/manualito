# Motores OCR

PaddleOCR obtiene el menor error medio en el conjunto de imágenes reales. Con
GPU tarda unos 11 segundos por imagen, frente a 117 en CPU, con el mismo error.
Tesseract tarda unos 7 segundos, pero su error medio es mayor.

En las imágenes sintéticas gana Tesseract. La muestra real es pequeña y solo
tiene fragmentos transcritos, así que ningún motor puede darse por mejor para
todos los manuales.
