import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
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
  errorComponent: ({ error }) => (
    <ErrorBoundary>
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Algo ha fallado</h1>
          <p className="mt-2 text-fg-2">{error.message}</p>
        </div>
      </div>
    </ErrorBoundary>
  ),
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
    <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg">Página no encontrada</h1>
        <p className="mt-2 text-fg-2">La URL que has intentado abrir no existe en Manualito.</p>
        <Link
          to="/home"
          className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-fg-inv shadow-sm hover:bg-primary-600"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
