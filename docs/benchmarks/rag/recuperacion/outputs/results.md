# Resultados de recuperación RAG

| Medición | Fecha | Preguntas | Recall@5 | Recall@10 | MRR | Errores |
| --- | --- | --- | --- | --- | --- | --- |
| auditoria-2026-08-09 | 2026-08-09T17:53:18Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |
| local-939812b83bbe | 2026-08-11T15:38:54Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |
| local-980801caf68c | 2026-08-14T06:10:59Z | 24 | 0,7917 | 0,8750 | 0,5184 | 0 |
| local-0e66aad3326a | 2026-08-16T16:33:52Z | 24 | 0,8333 | 0,9583 | 0,6335 | 0 |

## Desglose de `local-0e66aad3326a`

### Por juego

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| Catan | 15 | 0,7333 | 0,9333 | 0,5669 |
| Monopoly | 9 | 1,0000 | 1,0000 | 0,7444 |

### Por origen

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| auditoria | 4 | 1,0000 | 1,0000 | 1,0000 |
| gemma | 20 | 0,8000 | 0,9500 | 0,5602 |

## Casos fallidos en recall@5

| ID | Juego | Origen | Posición | Pregunta |
| --- | --- | --- | --- | --- |
| pregunta-002 | Catan | gemma | 17 | ¿Qué hacer si ya conocía versiones anteriores de la ampliación? |
| pregunta-004 | Catan | gemma | 6 | ¿Qué debe recibir cada jugador al empezar? |
| pregunta-005 | Catan | gemma | 6 | ¿Cómo obtengo materias primas en mi turno? |
| pregunta-013 | Catan | gemma | 9 | ¿Qué se necesita para saber qué materiales producirán en un turno? |

La línea histórica no conserva candidatos (`top_5 = null`). Las mediciones locales guardan como máximo cinco identificadores por pregunta.
