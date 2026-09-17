# Preprocesado OCR

El preprocesado que mejor funciona depende del motor. Para Tesseract, ampliar la
imagen 2,5 veces y pasarla a grises reduce más el error. Para PaddleOCR, la regla
del estudio elige CLAHE, un ajuste del contraste local, con clip 1 y rejilla 16.

Estas opciones cumplen los criterios del estudio sobre diez imágenes. No hay
una transformación que deba aplicarse siempre a cualquier manual.
