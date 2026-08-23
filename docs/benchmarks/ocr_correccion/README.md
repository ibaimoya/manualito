# Benchmark de corrección OCR

Mide el pipeline de corrección de la issue #21 — gate de confianza en tres
zonas, reglas deterministas y consenso LLM (`POST /correct-line`) — sobre un
dataset versionado de 73 líneas con verdad terreno. Separa el **flujo de
producto** (líneas reales de manuales, con gate y franja) del **corrector
aislado** (baterías sintéticas de typos, diacríticos y segmentación).

## Ejecución

Modo lectura (valida contrato y muestra el resumen sin tocar nada):

```bash
uv run --locked --no-default-groups --group benchmarks jupyter execute docs/benchmarks/ocr_correccion/benchmark.ipynb
```

Medición real (requiere el stack levantado con el perfil `high`, que define
`OLLAMA_CORRECTION_MODEL`):

```bash
MANUALITO_OCRCORR_RUN=1 uv run --locked --no-default-groups --group benchmarks jupyter execute docs/benchmarks/ocr_correccion/benchmark.ipynb
```

`MANUALITO_OCRCORR_FORCE=1` reemplaza la medición existente de la misma
configuración. Subir `FLOW_VERSION` en el notebook añade una medición nueva
sin borrar el histórico.

## Contrato de resultados

`outputs/results.json` sigue el contrato v2 de los benchmarks de la casa:
`{"version": 2, "mediciones": [...]}` con la línea base sin corrección en
primera posición, hash canónico de configuración para la idempotencia, métricas
por bloque (`exactas`, `sobrecorreccion`, `cer`) y por categoría, y la salida
de cada caso. `results.md` y `conclusions.md` se generan, no se editan.

## Bibliografía

El diseño del pipeline (consenso frente a pasada única, candados, few-shot
descartado, contexto acotado) proviene de campañas experimentales propias
guiadas por estos trabajos:

- *Historical Ink: 19th-century Latin American Spanish newspaper corpus with
  LLM OCR correction* (2024). Corrección con LLM en español histórico; midió
  que la mayoría de las ediciones de una pasada única eran alucinaciones.
- Boros et al. (2024). *Post-correction of historical text transcripts with
  large language models*. El few-shot empeoró los modelos abiertos.
- Bourne (2024). *CLOCR-C: Context leveraging OCR correction with pre-trained
  language models*. El contexto cercano mejora la corrección.
- HIPE-OCRepair (ICDAR 2026). Penalización explícita de la sobrecorrección y
  candados sobre entidades: la post-corrección no es generación libre.
