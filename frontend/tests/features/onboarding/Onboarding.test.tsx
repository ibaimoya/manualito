import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const stub = (path: string, id: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div data-testid={id}>{id}</div>,
    });
  const tree = root.addChildren([
    onboardingR,
    stub('/login', 'login-screen'),
    stub('/register', 'register-screen'),
  ]);
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

describe('Onboarding', () => {
  it('renderiza el botón Empezar', async () => {
    renderOnboarding();
    expect(await screen.findByRole('button', { name: /Empezar/i })).toBeInTheDocument();
  });

  it('"Empezar" avanza de paso, no entra a la app', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Empezar/i }));
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-screen')).not.toBeInTheDocument();
  });

  it('Saltar marca el onboarding como visto y lleva a /login (una sola vez)', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    const skip = await screen.findByRole('button', { name: /Saltar/i });
    await user.click(skip);
    await user.click(skip);
    await user.click(skip);
    expect(localStorage.getItem('manualito.onboarding.seen')).toBe('1');
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });

  it('la pantalla de elección "Crear cuenta" lleva a /register', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    // Salto a la última diapositiva y continúo hasta la pantalla de elección.
    await user.click(await screen.findByRole('tab', { name: /Ir a diapositiva 4/i }));
    await user.click(await screen.findByRole('button', { name: /Continuar/i }));
    await user.click(await screen.findByRole('button', { name: /Crear cuenta/i }));
    expect(await screen.findByTestId('register-screen')).toBeInTheDocument();
  });

  it('la pantalla de elección "Ya tengo cuenta" lleva a /login', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('tab', { name: /Ir a diapositiva 4/i }));
    await user.click(await screen.findByRole('button', { name: /Continuar/i }));
    await user.click(await screen.findByRole('button', { name: /Ya tengo cuenta/i }));
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });
});
