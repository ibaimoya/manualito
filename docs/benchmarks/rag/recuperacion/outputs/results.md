# Resultados de recuperación RAG

| Medición | Fecha | Preguntas | Recall@5 | Recall@10 | MRR | Errores |
| --- | --- | --- | --- | --- | --- | --- |
| auditoria-2026-08-09 | 2026-08-09T17:53:18Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |
| local-939812b83bbe | 2026-08-11T15:38:54Z | 24 | 0,7917 | 0,7917 | 0,4979 | 0 |

## Desglose de `local-939812b83bbe`

### Por juego

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| Catan | 15 | 0,9333 | 0,9333 | 0,5800 |
| Monopoly | 9 | 0,5556 | 0,5556 | 0,3611 |

### Por origen

| Grupo | Total | Recall@5 | Recall@10 | MRR |
| --- | --- | --- | --- | --- |
| auditoria | 4 | 0,2500 | 0,2500 | 0,2500 |
| gemma | 20 | 0,9000 | 0,9000 | 0,5475 |

## Casos fallidos en recall@5

| ID | Juego | Origen | Posición | Pregunta |
| --- | --- | --- | --- | --- |
| pregunta-004 | Catan | gemma | >20 | ¿Qué debe recibir cada jugador al empezar? |
| pregunta-020 | Monopoly | gemma | >20 | ¿Cómo se empieza a jugar? |
| pregunta-021 | Monopoly | auditoria | >20 | Para cuantos jugadores es el juego? |
| pregunta-022 | Monopoly | auditoria | >20 | cuanta gente puede jugar a la vez? |
| pregunta-023 | Monopoly | auditoria | >20 | Cuanto dinero recibe cada jugador al empezar? |

La línea histórica no conserva candidatos (`top_5 = null`). Las mediciones locales guardan como máximo cinco identificadores por pregunta.
