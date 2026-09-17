import { Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router';
import { RecoveryPage } from '@/shared/components/recovery/RecoveryPage';
import { mapApiError } from '@/shared/api/error-mapper';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import { meQueryOptions } from '@/features/auth/auth-queries';
import type { RouterContext } from '@/app/router-context';

/**
 * Raíz del router. Resuelve la sesión una sola vez en "beforeLoad" y la deja en
 * el contexto ("user") para que los guards de "_app"/"_public" decidan sin
 * parpadeo. El shell autenticado vive en "_app"; aquí solo va lo global.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(meQueryOptions());
    return { user: session?.user ?? null };
  },
  component: RootLayout,
  pendingComponent: RouteLoadingFallback,
  notFoundComponent: NotFoundComponent,
  errorComponent: RootErrorComponent,
});

function RootLayout() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Outlet />
    </Suspense>
  );
}

function RouteLoadingFallback() {
  const { t } = useTranslation('shell');

  return (
    <div
      aria-live="polite"
      aria-label={t('loading.ariaLabel')}
      className="grid min-h-dvh place-items-center"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="block h-8 w-8 rounded-full border-4 border-primary-100 border-t-primary motion-safe:animate-[mn-spin_0.9s_linear_infinite]"
        />
        <span className="mono text-xs text-fg-3">{t('loading.text')}</span>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return <RecoveryPage kind="not-found" />;
}

function RootErrorComponent({ error }: Readonly<{ error: Error }>) {
  const router = useRouter();
  return (
    <RecoveryPage
      kind={mapApiError(error).code === 'network' ? 'offline' : 'error'}
      message={error.message}
      onRetry={() => router.invalidate()}
    />
  );
}
