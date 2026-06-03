# Manualito · Frontend

PWA en React 19 + TypeScript que consume el backend FastAPI de Manualito.
El usuario fotografía un manual de juego de mesa y la app genera una
explicación clara con resumen, preparación, turno y condiciones de victoria,
más un chat para preguntar cualquier duda.

## Stack

| Pieza | Versión / decisión |
|---|---|
| Build tool | Vite 8 (Rolldown + Oxc) |
| UI runtime | React 19, TypeScript 5 strict (+ `noUncheckedIndexedAccess`) |
| Estilado | Tailwind CSS v4 (`@theme inline`) sobre tokens propios (`tokens.css`) |
| Componentes | shadcn-style sobre Radix UI primitives |
| Iconos | Lucide React (strokeWidth 1.75) |
| Tipografía | Manrope (display) + Inter (cuerpo) + JetBrains Mono — variable, local (`@fontsource-variable/*`) |
| Routing | TanStack Router (file-based + autoCodeSplitting) |
| Server state | TanStack Query |
| Persistencia local | `localStorage` con schemas Zod |
| Notificaciones | `sonner` |
| PWA | `vite-plugin-pwa` (Workbox · NetworkFirst para `/api/*`) |
| Tests | Vitest 4 + RTL + jest-axe + MSW |
| Gestor de paquetes | pnpm 11 |
| Runtime web (prod) | Nginx Alpine + proxy_pass a `api:8000` |

Más detalle de cada decisión y enlaces a las fuentes en
[`../notimportant/decisiones-frontend.txt`](../notimportant/decisiones-frontend.txt).

## Estructura

```
src/
  app/                      providers + theme + router glue
  routes/                   file-based routing (TanStack Router)
  features/
    onboarding/             intro cinematográfico (mesh + view transitions)
    manual/                 componentes compartidos sobre manuales
    processing/             hook que orquesta las 4 preguntas iniciales
  shared/
    api/                    cliente HTTP + error-mapper
    components/             Brand, ErrorBoundary
    lib/                    cn(), storage (zod)
  components/ui/            primitivos shadcn-style (Button, Card, …)
  styles/                   tokens.css + globals.css
  test/                     setup, MSW handlers, server, render helper
```

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Genera el route tree y arranca Vite en `:5173` |
| `pnpm build` | Genera el route tree, `tsc --build`, `vite build` + SW |
| `pnpm preview` | Sirve el bundle de producción local |
| `pnpm lint` | ESLint 9 flat config (`--max-warnings 0`) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest run (incluye jsdom) |
| `pnpm test:coverage` | Vitest + cobertura V8 (lcov + html) |
| `pnpm test:ui` | UI de Vitest (Playwright dashboard) |
| `pnpm format` | Prettier --write . |
| `pnpm routes:generate` | TanStack Router CLI |
| `pnpm api:generate` | Genera tipos desde `/openapi.json` del backend |

## Desarrollo

```bash
# 1. Arrancar el backend (en otra terminal)
cd .. && docker compose up -d api ocr rag llm chroma ollama

# 2. Arrancar el frontend en dev (proxy a localhost:8000)
cd frontend && pnpm dev
# → http://localhost:5173
```

El proxy de Vite (`server.proxy['/api']`) reenvía a `localhost:8000`.  Las
llamadas del cliente usan URLs relativas (`/api/manuals`, etc.), por lo que
no hay que tocar nada al pasar a producción detrás de Nginx.

## Despliegue (Docker Compose)

El servicio `frontend` está añadido a `../compose.yaml` con el mismo
hardening que el backend (read_only, cap_drop ALL, no-new-privileges,
pids_limit) más `tmpfs` extras para los directorios donde Nginx escribe
(`/var/cache/nginx`, `/var/run`, `/var/log/nginx`) — todos como `uid=1001`
para coincidir con el usuario `appuser` del contenedor.

```bash
docker compose up -d --build frontend
# → http://localhost:5173
```

Nginx sirve `dist/` y hace `proxy_pass /api → api:8000`.  No hay CORS porque
todo es mismo origen.

## Tests

```bash
pnpm test            # Vitest run
pnpm test:coverage   # con cobertura V8 (HTML + lcov)
```

A día de hoy: **85 tests, 13 ficheros**, cobertura 88.84% statements en las
piezas testeadas (storage, theme, API client, error mapper, hooks, primitivos
UI).  Los tests de pantallas completas usan `renderWithProviders` y MSW para
mockear las llamadas a `/api/*` sin levantar Docker.

## Estados que aún se mockean en cliente

Hasta que el backend implemente los endpoints correspondientes, el frontend
mantiene en `localStorage`:

| Slot | Contenido | Cuando exista en backend |
|---|---|---|
| `manualito.manuals` | Lista de manuales recientes | `GET /api/manuals` |
| `manualito.qa.{id}` | Historial de Q&A por manual | `GET/POST /api/manuals/{id}/conversations` |
| `manualito.settings` | Tema, densidad, acento | `GET/PUT /api/users/me/preferences` |
| `manualito.onboarding.seen` | Flag onboarding visto | (puede ser solo cliente) |

Lista completa de gaps y contratos esperados en
[`BACKEND_TODO.md`](BACKEND_TODO.md).

## Accesibilidad

- Targets táctiles ≥ 44 px (WCAG 2.2 SC 2.5.8) en botones principales.
- Contraste WCAG AA verificado para los pares texto/fondo de la paleta.
- `prefers-reduced-motion` respetado globalmente.
- Navegación completa con teclado (TanStack Router + Radix).
- Tests automáticos con `jest-axe` en componentes críticos.

## Licencia

Hereda la licencia del proyecto (MIT — ver `../LICENSE`).
