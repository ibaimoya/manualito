# Benchmarks

Abre el notebook para ver el método, las tablas y las gráficas. Las conclusiones
resumen qué se obtuvo y hasta dónde llega cada prueba.

| Estudio | Notebook | Conclusiones |
| :---: | --- | --- |
| Motores OCR | [Abrir](ocr/engines/benchmark.ipynb) | [Leer](ocr/engines/conclusions.md) |
| Preprocesado OCR | [Abrir](ocr/preprocessing/benchmark.ipynb) | [Leer](ocr/preprocessing/conclusions.md) |
| Corrección OCR | [Abrir](ocr/correction/benchmark.ipynb) | [Leer](ocr/correction/conclusions.md) |
| Embeddings | [Abrir](rag/embeddings/benchmark.ipynb) | [Leer](rag/embeddings/conclusions.md) |
| Chunking | [Abrir](rag/chunking/benchmark.ipynb) | [Leer](rag/chunking/conclusions.md) |
| Recuperación | [Abrir](rag/retrieval/benchmark.ipynb) | [Leer](rag/retrieval/conclusions.md) |
| Modelos de lenguaje | [Abrir](llm/comparison/benchmark.ipynb) | [Leer](llm/comparison/conclusions.md) |
| Modelos de bajos recursos | [Abrir](llm/low-resource/benchmark.ipynb) | [Leer](llm/low-resource/conclusions.md) |

También se conservan las pruebas anteriores de
[preprocesado](ocr/preprocessing/historico/benchmark.ipynb) y
[modelos de lenguaje](llm/comparison/archive/benchmark.ipynb).

## Archivos

- `benchmark.ipynb` contiene el estudio y sus salidas guardadas.
- `conclusions.md` resume el resultado.
- `results.json` conserva las mediciones. Algunos estudios tienen más de un JSON.
- `measure.py`, cuando existe, permite repetir la medición en una carpeta nueva.
- `dataset/` contiene los datos de entrada. `text/` guarda las salidas de los motores OCR.

## Ejecutar

Con Python 3.13, desde la raíz del repositorio.

```bash
uv sync --locked --only-group benchmarks
uv run --locked --only-group benchmarks jupyter execute docs/benchmarks/rag/embeddings/benchmark.ipynb
```

Por defecto, los notebooks solo leen resultados guardados. Para medir de nuevo, consulta las instrucciones del
notebook o ejecuta `measure.py --help`. Las mediciones requieren dependencias adicionales y algunas pueden tardar horas.
