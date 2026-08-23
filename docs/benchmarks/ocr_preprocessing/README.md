# Benchmark OCR/preprocesado

El artefacto principal es `benchmark.ipynb`, pensado para poder usarse como anexo de la memoria del TFG. Compara preprocesados de imagen para los tres motores OCR que nos importan en Manualito:

- `tesseract`
- `paddle_cpu`
- `paddle_gpu`

El notebook guarda resultados en `outputs/results.json`, `outputs/results.md` y `outputs/conclusions.md`. Si ya existe un resultado para un motor, no lo repite salvo que se active `FORCE = True`.

La evaluación es independiente por motor: cada uno tiene su baseline, sus deltas y su recomendación. Así se puede justificar, por ejemplo, que Tesseract necesite un preprocesado distinto al de PaddleOCR.

`TECHNIQUE_PRESET = "compact"` prueba 28 configuraciones. `TECHNIQUE_PRESET = "extended"` sube a 60 para afinar parámetros.

## Imágenes

El dataset versionado combina imágenes libres reales con controles sintéticos generados por el notebook:

- Fotos o páginas reales con licencias compatibles.
- Imágenes históricas o de prensa como estrés técnico.
- Imágenes sintéticas reproducibles con texto limpio, sombra/ruido y perspectiva.
- Texto en español con tildes, `ñ` y vocabulario realista de reglas.

Las imágenes sintéticas no sustituyen a fotos propias de Manualito. Sirven para controlar casos conocidos y comprobar que una técnica no empeora textos sencillos. Para cerrar una conclusión fuerte conviene ampliar el dataset con imágenes propias:

- 12 imágenes en total: 8 para ajustar y 4 para validar.
- 1-2 imágenes por caso de prueba; muchas páginas casi iguales inflan el benchmark sin aportar señal.
- Cada imagen debe tener ground truth revisado a mano.
- Guardar metadatos en `manifest.json`: `split`, `difficulty`, `capture`, `source` y `rights`.
- No subir al repo páginas completas de manuales comerciales si no hay permiso o licencia clara.

Cupos recomendados:

| Caso | Ajuste | Validación |
| --- | ---: | ---: |
| Foto frontal limpia | 2 | 1 |
| Perspectiva o curvatura | 2 | 1 |
| Sombras, reflejos o baja luz | 2 | 1 |
| Texto pequeño, columnas, listas o tablas | 2 | 1 |
| PDF/escaneo | opcional | opcional |
| Imagen histórica/degradada | opcional | opcional |

## Ejecución completa

Para ejecutar los tres motores en una sola pasada, usa el entorno de Paddle GPU. `paddle_cpu` usa el mismo paquete de Paddle, pero fuerza `device="cpu"`; `paddle_gpu` fuerza `device="gpu"`.

```bash
uv sync --no-default-groups --group ocr --group ocr-paddle --group ocr-paddle-gpu --group ocr-tesseract
```

Abre el notebook:

```bash
jupyter notebook docs/benchmarks/ocr_preprocessing/benchmark.ipynb
```

Y deja la configuración así:

```python
RUN_BENCHMARK = True
FORCE = False
ALLOW_ENGINE_SKIP = False
INCLUDE_SYNTHETIC_IMAGES = True
TECHNIQUE_PRESET = "extended"
ENGINES = ["tesseract", "paddle_cpu", "paddle_gpu"]
```

Con `ALLOW_ENGINE_SKIP = False`, si uno de los tres motores falla, falla la ejecución. Así no se generan conclusiones parciales sin darte cuenta.

## Ejecución parcial

Solo para depurar CPU/Tesseract sin GPU:

```bash
uv sync --no-default-groups --group ocr --group ocr-paddle --group ocr-paddle-cpu --group ocr-tesseract
```

Y en el notebook:

```python
ENGINES = ["tesseract", "paddle_cpu"]
```

Ese modo no sirve para cerrar el benchmark completo porque no ejecuta `paddle_gpu`.

## Metodología

- El warm-up de cada motor se ejecuta fuera de la medición principal.
- Se mide por separado el tiempo de preprocesado y el tiempo de OCR.
- La calidad se calcula contra fragmentos de ground truth con CER y WER.
- Los resultados se guardan por motor dentro de la misma caché.
- Se prueban 28 configuraciones compactas o 60 en modo extendido: contraste, binarización, nitidez, reescalado, ruido, morfología y pipelines combinados.
- La recomendación de cada motor exige mejorar el CER frente a su propia baseline y mejorar al menos la mitad de las imágenes.

## Referencias

### Metodología

- [MathWorks evaluateOCR](https://www.mathworks.com/help/vision/ref/evaluateocr.html): evaluación OCR contra ground truth con CER/WER.
- [Google Benchmark User Guide](https://github.com/google/benchmark/blob/main/docs/user_guide.md): warm-up, medición manual y separaci?n de temporizadores.
- [NISTIR 5932](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5932.pdf): limitaciones de las métricas OCR y necesidad de elegir medidas según el uso.
- [When Good OCR Is Not Enough](https://openreview.net/pdf/940942c89171e01085f257e7f04e5db4ee82407c.pdf): en pipelines RAG no basta con CER/WER; importa el impacto downstream.

### Dataset incluido

| Fichero | Fuente | Licencia/uso |
| --- | --- | --- |
| `periodico_granma.jpg` | [Dos ejemplares del Peri?dico Granma](https://commons.wikimedia.org/wiki/File:Dos_ejemplares_del_Peri%C3%B3dico_Granma.jpg) | CC BY-SA 4.0 |
| `manual_merck_veterinaria.jpg` | [Manual Merck de Veterinaria, folleto 1994](https://commons.wikimedia.org/wiki/File:Manual-merck-de-veterinaria-cuarta-edicion-folleto-1994.jpg) | CC0 1.0 |
| `diario_burgos_1928.jpg` | [Diario de Burgos, 22 de marzo de 1928](https://prensahistorica.mcu.es/en/publicaciones/verNumero.do?idNumero=1000474386) | CC BY 4.0 para la copia digital |
| `juego_mesa_palma_p1.jpg` | [Juego de mesa palma](https://commons.wikimedia.org/wiki/File:Juego_de_mesa_palma.pdf), renderizado desde PDF original | CC BY-SA 4.0 |
| `juego_oca_met.jpg` | [Juego de la Oca, MET](https://www.metmuseum.org/art/collection/search/717686) | CC0 1.0 |
| `juego_oca_loc.jpg` | [Juego de la oca, Library of Congress](https://commons.wikimedia.org/wiki/File:Juego_de_la_oca_LCCN99615951.jpg), convertido desde TIFF de LOC | Public Domain Mark 1.0 |
| `croquet_manual_1865_p3.jpg` | [How to play croquet, 1865](https://commons.wikimedia.org/wiki/File:How_to_play_croqu%C3%AAt_-_a_new_pocket_manual_of_complete_instructions_for_American_players,_illustrated_with_engravings_and_diagrams,_together_with_all_the_rules_of_the_game_(IA_howtoplaycroqu00adam).pdf), convertido desde JP2 de Internet Archive | Dominio público |
| `sintetico_manual_limpio.png` | Generado por `benchmark.ipynb` | Sintético propio |
| `sintetico_manual_sombra.png` | Generado por `benchmark.ipynb` | Sintético propio |
| `sintetico_manual_perspectiva.png` | Generado por `benchmark.ipynb` | Sintético propio |

### Originales descargados

| Fichero | Uso |
| --- | --- |
| `raw/juego_mesa_palma.pdf` | PDF original usado para renderizar `juego_mesa_palma_p1.jpg`. |
| `raw/croquet_manual_1865.pdf` | PDF original completo de Internet Archive. |
| `raw/croquet_manual_1865_p3.jp2` | Página original usada para generar `croquet_manual_1865_p3.jpg`. |
| `raw/rattfallan_rules_1819.pdf` | Fuente revisada y no incluida en el benchmark evaluable. |

### Nota de uso

`juego_mesa_palma_p1.jpg` se usa como validación porque es el caso libre más cercano a Manualito: reglas modernas en español. Las imágenes históricas quedan como `stress`; sirven para medir robustez, pero no deberían decidir por sí solas el preprocesado por defecto.

Fuente revisada y no incluida: [Rattfallan board game 1819 rules](https://commons.wikimedia.org/wiki/File:R%C3%A5ttf%C3%A4llan_board_game_1819_rules.pdf). El original queda en `raw/`, pero no entra en el benchmark porque no es representativo para Manualito y mete una dificultad histórica/idiom?tica que desviar?a la conclusión.
