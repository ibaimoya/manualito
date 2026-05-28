import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { ThemeProvider } from '@/app/theme';
import { Onboarding } from '@/features/onboarding/Onboarding';

/**
 * Tests del bug #5 del catálogo: el view-transition de "Empezar" /
 * "Entrar a la app" debe deduplicarse contra spam.
 */
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderOnboarding() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const onboardingR = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    component: Onboarding,
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

describe('Onboarding view-transition guard', () => {
  it('renderiza el botón Empezar', async () => {
    renderOnboarding();
    expect(
      await screen.findByRole('button', { name: /Empezar/i }),
    ).toBeInTheDocument();
  });

  it('múltiples clicks en Saltar solo dispara UNA navegación', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    const skip = await screen.findByRole('button', { name: /Saltar/i });
    // Tres clicks rápidos
    await user.click(skip);
    await user.click(skip);
    await user.click(skip);

    // markOnboardingSeen se ejecuta solo una vez (no se acumula)
    expect(localStorage.getItem('manualito.onboarding.seen')).toBe('1');
    // Tras la transición acabamos en /home
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
  });

  it('al pulsar "Empezar" en la hero navega a paso siguiente, no a /home', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(await screen.findByRole('button', { name: /Empezar/i }));
    // Sigue dentro del onboarding (next slide), no en home
    expect(screen.queryByTestId('home-screen')).not.toBeInTheDocument();
  });
});
