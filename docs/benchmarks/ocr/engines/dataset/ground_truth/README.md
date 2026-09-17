# Transcripciones de referencia

Cada archivo `<imagen_id>.txt` contiene fragmentos revisados de una imagen.
Se evalúa cada línea no vacía por separado, sin exigir una transcripción completa
de la página.

El evaluador busca cada fragmento dentro de la salida OCR mediante coincidencia
aproximada, por lo que no penaliza al motor por extraer texto adicional. Al ampliar
el conjunto, las nuevas transcripciones deben contrastarse con la imagen antes
de utilizarlas en la evaluación.
