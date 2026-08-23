# Resultados de recuperación RAG

| Medición | Fecha | Preguntas | Recall@5 | Recall@10 | MRR | Errores |
| --- | --- | --- | --- | --- | --- | --- |
| auditoria-2026-08-09 | 2026-08-09T17:53:18Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |
| local-939812b83bbe | 2026-08-11T15:38:54Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |
| local-980801caf68c | 2026-08-14T06:10:59Z | 24 | 0,7917 | 0,8750 | 0,5184 | 0 |
| local-0e66aad3326a | 2026-08-16T16:33:52Z | 24 | 0,8333 | 0,9583 | 0,6335 | 0 |
| local-957613c07305 | 2026-08-18T21:04:12Z | 24 | 0,9167 | 1,0000 | 0,7125 | 0 |

## Desglose de `local-957613c07305`

### Por juego

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| Catan | 15 | 0,9333 | 1,0000 | 0,7289 |
| Monopoly | 9 | 0,8889 | 1,0000 | 0,6852 |

### Por origen

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| auditoria | 4 | 1,0000 | 1,0000 | 0,6458 |
| gemma | 20 | 0,9000 | 1,0000 | 0,7258 |

## Casos fallidos en recall@5

| ID | Juego | Origen | Posición | Pregunta |
| --- | --- | --- | --- | --- |
| pregunta-004 | Catan | gemma | 10 | ¿Qué debe recibir cada jugador al empezar? |
| pregunta-020 | Monopoly | gemma | 6 | ¿Cómo se empieza a jugar? |

La línea histórica no conserva candidatos (`top_5 = null`). Las mediciones locales guardan como máximo cinco identificadores por pregunta.
