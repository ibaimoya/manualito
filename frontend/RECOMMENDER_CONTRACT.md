# Contrato del recomendador (frontend → backend)

El frontend ya consume este contrato (cliente en `src/shared/api/client.ts`,
mock en `tests/_helpers/mswHandlers.ts`). El backend (`api`) lo implementa en
una fase posterior; mientras tanto el frontend funciona contra el mock MSW.

Decisiones de diseño que respeta este contrato:

- **Recomendador v1 = content-based** sobre los metadatos de la biblioteca del
  usuario (mecánicas/categorías/peso/jugadores/duración de BGG). Sin cold-start,
  sin necesidad de datos de uso.
- **Collaborative filtering = fase 2**, con `game_ratings` propios (ver memoria
  `project-manualito-db-decisions`). Los endpoints de señal van más abajo.
- **Legal**: los metadatos BGG se muestran con atribución; **no** se pasan datos
  de BGG al LLM (la cláusula anti-IA de BGG; ver `manualito-recommender-legal`).

---

## v1 — en uso por el frontend

### `GET /api/recommendations?limit=<int>`

Juegos sugeridos para el usuario autenticado (content-based). Requiere sesión.

```jsonc
// 200 OK
{
  "recommendations": [
    {
      "id": "uuid",
      "name": "Carcassonne",
      "bgg_id": 822,            // number | null
      "year_published": 2000,  // number | null
      "reason": "Porque tienes Catan"  // motivo legible, no vacío
    }
  ],
  "attribution": "Game data provided by BoardGameGeek."
}
```

- `limit` opcional (sugerido por defecto 6, máx. 12).
- Lista vacía si no hay base suficiente (biblioteca vacía) → el frontend oculta
  la sección «Para ti», no muestra error.
- `reason` lo pinta la UI tal cual; mantenerlo corto (≤ ~60 chars).
- `attribution` se renderiza como «Powered by BoardGameGeek» (requisito ToU).

---

## Fase 2 — señal para collaborative filtering (aún no consumido)

Cuando se aborde el CF, el frontend añadirá valorar/favoritos. Contrato previsto
(NO implementar todavía; se cerrará al empezar esa subfase):

- `PUT /api/games/{game_id}/favorite` body `{ "favorite": bool }` → 204.
- `GET /api/favorites` → `{ "games": RecommendedGame[] }`.
- (opcional) `POST /api/games/{game_id}/rating` body `{ "rating": 1..5 }` → 204.

Persistencia en la tabla `game_ratings` ya decidida. El favorito recupera el
icono *bookmark* retirado en la fase de rediseño.
