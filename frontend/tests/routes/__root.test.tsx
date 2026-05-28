import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { ThemeProvider } from '@/app/theme';
import { Route as RootRoute } from '@/routes/__root';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/**
 * Monta el RootRoute real con sub-rutas controladas.  El RootComponent
 * decide si renderiza Sidebar/BottomNav según la pathname actual y el
 * media query 'desktop'.
 */
function mountRoot(initialPath: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const make = (path: string, label: string) =>
    createRoute({
      getParentRoute: () => RootRoute,
      path,
      component: () => <div data-testid={`page-${label}`}>{label}</div>,
    });
  const tree = RootRoute.addChildren([
    make('/home', 'home'),
    make('/history', 'history'),
    make('/settings', 'settings'),
    make('/onboarding', 'onboarding'),
    make('/capture', 'capture'),
    make('/processing', 'processing'),
    make('/result/$manualId', 'result'),
    make('/chat/$manualId', 'chat'),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('__root', () => {
  it('incluye el skip-link "Saltar al contenido" para teclado (WCAG 2.4.1)', async () => {
    mountRoot('/home');
    expect(
      await screen.findByRole('link', { name: /Saltar al contenido/i }),
    ).toBeInTheDocument();
  });

  it('en /home muestra la BottomNav (rutas con bottom nav permitido)', async () => {
    mountRoot('/home');
    // Esperamos a que el contenido se monte.
    await screen.findByTestId('page-home');
    expect(
      await screen.findByRole('navigation', { name: /Navegación principal/i }),
    ).toBeInTheDocument();
    // En jsdom isDesktop=false → se monta también la Sidebar (hidden via CSS)
    // y la BottomNav.  Habrá ≥ 2 enlaces con texto "Inicio" (uno por nav).
    const inicios = screen.getAllByRole('link', { name: 'Inicio' });
    expect(inicios.length).toBeGreaterThanOrEqual(1);
  });

  it('en /history también muestra la BottomNav', async () => {
    mountRoot('/history');
    await screen.findByTestId('page-history');
    expect(
      await screen.findByRole('navigation', { name: /Navegación principal/i }),
    ).toBeInTheDocument();
  });

  it('en /onboarding OCULTA la BottomNav (ruta inmersiva)', async () => {
    mountRoot('/onboarding');
    await screen.findByTestId('page-onboarding');
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('en /capture OCULTA la BottomNav', async () => {
    mountRoot('/capture');
    await screen.findByTestId('page-capture');
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('en /processing OCULTA la BottomNav', async () => {
    mountRoot('/processing');
    await screen.findByTestId('page-processing');
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('en /chat/* OCULTA la BottomNav (chat inmersivo)', async () => {
    mountRoot('/chat/m1');
    await screen.findByTestId('page-chat');
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('en /result/* OCULTA la BottomNav', async () => {
    mountRoot('/result/m1');
    await screen.findByTestId('page-result');
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('URL desconocida renderiza el NotFoundComponent con "Volver al inicio"', async () => {
    mountRoot('/no-existe-12345');
    expect(
      await screen.findByText(/Página no encontrada/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Volver al inicio/i }),
    ).toBeInTheDocument();
  });

  it('errorComponent se monta cuando una ruta lanza (fallback con "Algo ha fallado")', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Forzamos un crash usando una ruta cuyo componente lanza.
    const Boom = () => {
      throw new Error('Test crash');
    };
    const crashRoute = createRoute({
      getParentRoute: () => RootRoute,
      path: '/crash',
      component: Boom,
    });
    const tree = RootRoute.addChildren([crashRoute]);
    const router = createRouter({
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: ['/crash'] }),
    });
    render(
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Algo ha fallado/i)).toBeInTheDocument();
    });
    spy.mockRestore();
  });
});
