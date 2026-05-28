import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { ThemeProvider } from '@/app/theme';
import { storage } from '@/shared/lib/storage';

/**
 * Catálogo bug #31: `beforeLoad` debe redirigir a /home si el onboarding
 * ya se ha visto, incluso si el usuario pega manualmente la URL.
 *
 * Replicamos la lógica del Route real en un router sintético — el
 * routeTree generado por TanStack Router lee `Route` desde un fichero
 * con createFileRoute, pero en test es más limpio reconstruirlo a mano
 * con createRoute + beforeLoad para aislar el comportamiento.
 */
afterEach(() => {
  localStorage.clear();
});

function renderOnboardingRoute() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const onboardingR = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    // Misma lógica que en routes/onboarding.tsx.
    beforeLoad: () => {
      if (storage.isOnboardingSeen()) {
        throw redirect({ to: '/home' });
      }
    },
    component: () => <div data-testid="onboarding-screen">Onboarding</div>,
  });
  const homeR = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div data-testid="home-screen">Home</div>,
  });
  const tree = root.addChildren([onboardingR, homeR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/onboarding'] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/onboarding beforeLoad redirect', () => {
  it('si el onboarding NO se ha visto, renderiza la pantalla', async () => {
    renderOnboardingRoute();
    expect(await screen.findByTestId('onboarding-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
  });

  it('si el onboarding YA se ha visto, redirige a /home antes de renderizar', async () => {
    storage.markOnboardingSeen();
    renderOnboardingRoute();
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-screen')).not.toBeInTheDocument();
  });
});
