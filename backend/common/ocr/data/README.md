# Léxico español vendorizado

`lexico_es.txt` contiene 49 520 palabras españolas en minúscula, una por línea,
ordenadas por frecuencia descendente. Se usa como vocabulario de validación del
des-guionado de líneas OCR.

Procedencia: derivado de la lista `content/2018/es/es_50k.txt` del proyecto
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave,
licencia MIT), construida sobre el corpus OpenSubtitles 2018 de OPUS. La
transformación local elimina la columna de frecuencia y filtra los tokens que
no son palabras alfabéticas españolas de al menos dos letras.
