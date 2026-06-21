# Frontend

[![React 19](https://img.shields.io/badge/React%2019-61DAFB?logo=react&logoColor=000)](https://react.dev/)
[![TypeScript 6](https://img.shields.io/badge/TypeScript%206-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 8](https://img.shields.io/badge/Vite%208-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vitest 4](https://img.shields.io/badge/Vitest%204-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![pnpm 11](https://img.shields.io/badge/pnpm%2011-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

Interfaz web de Manualito. Está desarrollada con React, TypeScript y Vite; en
desarrollo se sirve con el dev server de Vite y en Docker se compila como SPA
estática servida por Nginx.

El flujo recomendado para ejecutar la aplicación completa está en el
[README de la raíz](../README.md) o [aquí](../deploy/README.md). Este documento resume la
parte específica del frontend.

## Arranque rápido

Para trabajar solo en la interfaz:

```bash
cd frontend
pnpm install
pnpm dev
```

El dev server escucha en `http://localhost:5173` por defecto. Si ese puerto ya
está ocupado, Vite escogerá otro porque `strictPort` está desactivado.

El frontend espera que la API esté disponible en `http://localhost:8000`. Ese
destino se define en [`../config/frontend.env`](../config/frontend.env) mediante
`VITE_API_TARGET`.

Requisitos locales:

| Herramienta | Versión  |
| ----------- | -------- |
| Node.js     | `>=24`   |
| pnpm        | `11.5.1` |

Se prefiere pnpm porque acelera instalaciones y reduce espacio usando un store
compartido de dependencias; además, su `node_modules` estricto evita depender de
paquetes no declarados explícitamente.

## Stack técnico

| Capa            | Tecnología                                        |
| --------------- | ------------------------------------------------- |
| Runtime UI      | React 19, React DOM                               |
| Lenguaje        | TypeScript estricto                               |
| Build           | Vite 8, plugin oficial de React, target `es2025`  |
| Routing         | TanStack Router con rutas por archivo             |
| Estado servidor | TanStack Query                                    |
| Estilos         | Tailwind CSS v4, tokens propios y fuentes locales |
| Componentes     | Primitivos propios apoyados en Radix UI           |
| Iconos          | Lucide React                                      |
| Notificaciones  | Sonner                                            |
| PWA             | `vite-plugin-pwa` con caché offline               |
| Tests           | Vitest, Testing Library, MSW y jest-axe           |
| Runtime Docker  | Nginx Alpine, puerto interno `8080`               |

## Estructura

```text
frontend/
  src/
    app/          providers, router y layout de aplicación
    components/   primitivos UI reutilizables
    features/     módulos de dominio: auth, juegos, manuales, perfil, PWA
    routes/       rutas por archivo de TanStack Router
    shared/       cliente API, hooks, helpers y componentes transversales
    styles/       tokens y estilos globales
    types/        tipos compartidos del frontend
  tests/          suites de Vitest espejando app, routes, features y shared
```

El árbol de rutas generado vive en `src/routeTree.gen.ts`. Es un artefacto de
TanStack Router y no debe editarse a mano.

## Scripts

| Comando                | Uso                                                |
| ---------------------- | -------------------------------------------------- |
| `pnpm dev`             | Genera rutas y arranca Vite.                       |
| `pnpm build`           | Ejecuta `tsc -b` y genera el bundle de producción. |
| `pnpm preview`         | Sirve localmente el bundle construido.             |
| `pnpm lint`            | Ejecuta ESLint con `--max-warnings 0`.             |
| `pnpm lint:fix`        | Aplica fixes automáticos de ESLint.                |
| `pnpm typecheck`       | Ejecuta TypeScript sin emitir archivos.            |
| `pnpm test`            | Ejecuta la suite de Vitest.                        |
| `pnpm test:watch`      | Ejecuta Vitest en modo watch.                      |
| `pnpm test:coverage`   | Genera cobertura V8 en `coverage/`.                |
| `pnpm test:ui`         | Abre la UI de Vitest.                              |
| `pnpm format`          | Formatea con Prettier.                             |
| `pnpm format:check`    | Comprueba formato sin escribir.                    |
| `pnpm routes:generate` | Regenera `src/routeTree.gen.ts`.                   |

`pnpm api:generate` queda disponible como entrada a `@hey-api/openapi-ts` si se
necesita regenerar un cliente desde OpenAPI, pero no forma parte del flujo
normal de desarrollo.

## Desarrollo

Las llamadas HTTP del cliente usan rutas relativas (`/api/...` y `/health`).
Durante desarrollo, Vite las proxifica hacia `VITE_API_TARGET`; en Docker,
Nginx las proxifica hacia el servicio `api` de Compose.

El flujo habitual es:

1. Arrancar la API y servicios auxiliares con los scripts de la raíz.
2. Ejecutar `pnpm dev` dentro de `frontend/`.
3. Abrir la URL que imprima Vite.

Si la aplicación completa ya está levantada por Docker, el contenedor
`frontend` puede estar usando `5173`. En ese caso Vite elegirá otro puerto y la
API seguirá siendo la misma (`localhost:8000`).

## Docker

El servicio `frontend` se define en [`../compose.yaml`](../compose.yaml). El
build usa [`Dockerfile`](Dockerfile):

1. Etapa `builder`: instala dependencias con pnpm y ejecuta `pnpm build`.
2. Etapa `runtime`: copia `dist/` a Nginx y sirve la SPA desde el puerto `8080`.

Compose publica ese puerto como `http://localhost:5173`.

[`nginx.conf`](nginx.conf) aplica el fallback de SPA, caché largo para assets
hasheados, no-caché para `index.html`, proxy de `/api/` a `api:8000` y proxy de
`/health` al healthcheck del backend.

## Estado local

Los datos de usuario, manuales, juegos y conversaciones viven en el backend. El
frontend solo usa `localStorage` para preferencias y marcas de UI:

| Clave                              | Uso                                    |
| ---------------------------------- | -------------------------------------- |
| `manualito.settings`               | Tema y acento visual.                  |
| `manualito.onboarding.seen`        | Onboarding completado.                 |
| `manualito.conversations.seen`     | Última lectura vista por conversación. |
| `manualito.sidebar.collapsed`      | Estado colapsado de la barra lateral.  |
| `manualito.verifyBanner.dismissed` | Aviso de verificación de email oculto. |

`storage.wipeAll()` también borra claves antiguas de versiones previas
relacionadas con manuales cacheados en local.

## Calidad y tests

La configuración de ESLint está en [`eslint.config.js`](eslint.config.js). Usa
ESLint 9 con configuración plana, TypeScript, reglas de React, hooks,
accesibilidad JSX y Prettier al final.

La configuración de TypeScript está repartida entre `tsconfig.json`,
`tsconfig.app.json` y `tsconfig.node.json`. La app usa modo estricto, resolución
`bundler`, `noUncheckedIndexedAccess` y alias `@/*`.

La suite de tests usa:

- Vitest con `jsdom`.
- Testing Library para componentes y rutas.
- MSW para simular endpoints `/api/*`.
- jest-axe para checks de accesibilidad en componentes y pantallas críticas.

## Licencia

Hereda la [licencia MIT del proyecto](../LICENSE).
