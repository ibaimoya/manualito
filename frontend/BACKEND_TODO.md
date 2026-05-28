# Backend TODO — apuntes desde el frontend

> Funcionalidad que aparece en el frontend pero **no existe (aún) en backend**.
> Mientras tanto el frontend mockea o persiste en `localStorage`.
> Cuando backend lo implemente, sustituir el mock por la llamada real.

Backend operativo a fecha de redacción (2026-05-26):

| Método | Path | Devuelve |
|---|---|---|
| GET | `/health` | `{status: "ok"}` |
| POST | `/api/ocr` | `{lines: [{text, confidence}]}` |
| POST | `/api/ocr/text` | `text/plain` |
| POST | `/api/manuals` | `{manual_id, chunks_indexed, status, ocr_lines: [{text, confidence}]}` |
| POST | `/api/manuals/{id}/questions` | `{answer}` |

> **Cambio 2026-05-26 (Fase L):** `/api/manuals` ahora devuelve también
> `ocr_lines`.  Las líneas se extraen una sola vez en el gateway (las
> usa para indexar en RAG) y se propagan al cliente para que la vista
> "Ver texto original" del Result no tenga que llamar de nuevo al OCR.
> Coste runtime backend: 0 (el dato ya estaba en memoria).

---

## CRÍTICAS (sustituir antes del MVP público)

### 1. Autenticación / Users
- **Backend actual**: sin auth, todos los manuales son globales.
- **Frontend asume**: single-user local (sin login).
- **Endpoints esperados**:
  - `POST /api/auth/register { email, password }` → 201 + JWT
  - `POST /api/auth/login { email, password }` → 200 + JWT
  - `GET /api/me` → user info
  - `POST /api/auth/logout`
- **Pantallas frontend que dependen**: ninguna en v1; cuando exista, añadir `/login`, `/register` y proteger todas las rutas excepto `/onboarding`.
- **Impacto v1**: nulo. Cualquiera con la URL ve todos los manuales subidos. Aceptable como TFG.

### 2. GET /api/manuals
- **Backend actual**: solo POST. No hay listado.
- **Frontend asume**: lista en `localStorage['manualito.manuals']`. Visible en `/home` (recientes) y `/history`.
- **Endpoint esperado**:
  - `GET /api/manuals?limit&offset` → `{items: [{manual_id, name, created_at, chunks_indexed}], total}`
- **Cuando exista**: sustituir `storage.listManuals()` por `useQuery({queryKey: ['manuals'], queryFn: api.listManuals})`. El componente Home y History ya están preparados (consumen el mismo shape `ManualRecord`).

### 3. GET /api/manuals/{manual_id}
- **Backend actual**: no existe (solo POST de creación).
- **Frontend asume**: metadata viene de `localStorage`.
- **Endpoint esperado**:
  - `GET /api/manuals/{manual_id}` → `{manual_id, name, created_at, chunks_indexed, source_pages}`

### 4. DELETE /api/manuals/{manual_id}
- **Backend actual**: no existe.
- **Frontend asume**: borra del `localStorage` y olvida. El backend mantiene los chunks indexados (huérfanos).
- **Endpoint esperado**:
  - `DELETE /api/manuals/{manual_id}` → 204; borra también sus chunks de ChromaDB.

### 5. Persistencia de Q&A (conversaciones)
- **Backend actual**: cada `POST /api/manuals/{id}/questions` es stateless.
- **Frontend asume**: historial en `localStorage['manualito.qa.{manual_id}']`. La pantalla `/chat/$manualId` lee/escribe ahí.
- **Endpoints esperados**:
  - `GET /api/manuals/{manual_id}/conversations` → lista de conversaciones del usuario
  - `POST /api/manuals/{manual_id}/conversations` → crear conversación
  - `GET /api/manuals/{manual_id}/conversations/{conv_id}/messages`
  - `POST /api/manuals/{manual_id}/conversations/{conv_id}/messages { question }` → `{id, role, text, created_at}`

---

## NICE TO HAVE (post-MVP)

### 6. Errores OCR más granulares
- **Backend actual**: 415 cubre "formato inválido", "corrupto" y "borroso" indistintamente.
- **Frontend muestra**: error genérico de upload (mensaje universal).
- **Pedir al backend**: distinguir códigos/payloads:
  - `{detail: {code: 'ocr.blurry', confidence: 0.31}}` → 422
  - `{detail: {code: 'ocr.no_text'}}` → 422
  - `{detail: {code: 'ocr.unsupported_format', mime: 'image/heic'}}` → 415
  - `{detail: {code: 'ocr.too_small', resolution_px: 320}}` → 422
- **Beneficio**: la pantalla `Error` muestra el tip específico ("Más luz / superficie estable" cuando es borrosa, etc.) en lugar de un mensaje genérico.

### 7. Upload multi-página
- **Backend actual**: una imagen por POST.
- **Frontend asume v1**: una sola imagen (file input simple).
- **Endpoint esperado**:
  - `POST /api/manuals { name, images: [file, file, ...] }` con ordering implícito. Backend concatena el texto OCR antes de pasarlo al RAG.
- **UI prevista**: stack vertical de thumbnails con drag-to-reorder.

### 8. Preferences server-side
- **Backend actual**: no existe.
- **Frontend asume**: preferencias en `localStorage['manualito.settings']` (theme, density, accent, responseDetail).
- **Endpoints esperados** (gated por auth #1):
  - `GET /api/users/me/preferences`
  - `PUT /api/users/me/preferences {theme, responseDetail, density, locale}`

### 9. /api/config público
- **Backend actual**: constantes hardcoded en cliente (`MAX_IMAGE_SIZE = 20MB`, formatos aceptados).
- **Frontend asume**: valor fijo en `src/routes/capture.tsx`.
- **Endpoint esperado**:
  - `GET /api/config` → `{maxImageSize, supportedFormats, llmModel, version}` — frontend lo lee al arrancar y ajusta validaciones.

### 10. Fuente / cita en cada respuesta
- Backend RAG ya devuelve `source_page` en `RetrieveResponse`, pero `/api/manuals/{id}/questions` NO propaga esa info al cliente.
- **Sería ideal**: añadir `sources: [{page, snippet}]` a `AnswerResponse` para mostrar "según la página 3 del manual…" debajo de cada respuesta.

### 11. Cinco preguntas iniciales en lugar de cuatro
- Hoy en `useManualBootstrap` lanzamos 4 mutations paralelas (resumen, setup, turno, gana).
- Una quinta (casos especiales / excepciones) llenaría el cuarto acordeón sin esperar input del usuario.
- Coste: +1 llamada LLM por manual. Validar que no degrada calidad/coherencia antes de fijar.

---

## DECISIONES PENDIENTES DEL EQUIPO (no son gaps técnicos)

- **Detección móvil → cámara avanzada**: hoy el `<input type="file" capture="environment">` abre la cámara nativa en móviles y el selector en desktop. Funciona. Si en el futuro queremos guía de encuadre en tiempo real, edge-detection con `<canvas>`, etc., habrá que pasar a `getUserMedia`.
- **Compresión cliente**: si el usuario sube una foto > 5 MB, podríamos re-encodearla en el cliente (`canvas.toBlob('image/jpeg', 0.85)`) antes de subir. Reduce ancho de banda y latencia.
- **Modo offline real**: la PWA cachea el shell, pero `/api/*` falla offline. No se ha implementado queue de mutaciones offline → online.
