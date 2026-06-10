import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ErrorBoundary, FullPageError } from '@/shared/components/ErrorBoundary';
import { Meeple } from '@/shared/components/Brand';
import { meQueryOptions } from '@/features/auth/auth-queries';
import type { RouterContext } from '@/app/router-context';

/**
 * Raíz del router. Resuelve la sesión una sola vez en `beforeLoad` y la deja en
 * el contexto (`user`) para que los guards de `_app`/`_public` decidan sin
 * parpadeo. El shell autenticado vive en `_app`; aquí solo va lo global.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(meQueryOptions());
    return { user: session?.user ?? null };
  },
  component: RootLayout,
  notFoundComponent: NotFoundComponent,
  errorComponent: ({ error }) => <FullPageError message={error.message} />,
});

function RootLayout() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}

function RouteLoadingFallback() {
  return (
    <div
      aria-live="polite"
      aria-label="Cargando contenido"
      className="grid min-h-dvh place-items-center"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="block h-8 w-8 rounded-full border-4 border-primary-100 border-t-primary"
          style={{ animation: 'mn-spin 0.9s linear infinite' }}
        />
        <span className="mono text-xs text-fg-3">Cargando…</span>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="grid min-h-dvh place-items-center bg-surface px-6 py-10 text-center">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-6 grid size-24 place-items-center rounded-full bg-primary-100 text-primary-700">
          <Meeple size={52} />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          Esta página se ha perdido
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-2">
          La ficha ha caído fuera del tablero: la URL que intentas abrir no existe en Manualito.
        </p>
        <Link
          to="/home"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 font-body font-semibold text-fg-inv shadow-sm transition-colors hover:bg-primary-600"
        >
          Volver al inicio
        </Link>
        <p className="mono mt-6 text-xs tracking-[0.18em] text-fg-3">ERROR 404</p>
      </div>
    </div>
  );
}
