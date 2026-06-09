import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { ThemeProvider } from '@/app/theme';
import { Route as RootRoute } from '@/routes/__root';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

/**
 * Monta el RootRoute real (resuelve sesión en beforeLoad vía /api/me, mockeado)
 * con sub-rutas controladas. El shell autenticado vive en `_app`; aquí solo
 * verificamos lo global: render del Outlet, 404 y errorComponent.
 */
function mountRoot(initialPath: string, leaves: any[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = RootRoute.addChildren(leaves);
  const router = createRouter({
    routeTree: tree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const homePage = createRoute({
  getParentRoute: () => RootRoute,
  path: '/home',
  component: () => <div data-testid="page-home">home</div>,
});

describe('__root', () => {
  it('renderiza el contenido de la ruta hija en el Outlet', async () => {
    mountRoot('/home', [homePage]);
    expect(await screen.findByTestId('page-home')).toBeInTheDocument();
  });

  it('URL desconocida renderiza el NotFoundComponent con "Volver al inicio"', async () => {
    mountRoot('/no-existe-12345', [homePage]);
    expect(await screen.findByText(/Esta página se ha perdido/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al inicio/i })).toBeInTheDocument();
  });

  it('errorComponent se monta cuando una ruta lanza ("Algo ha fallado")', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const crashRoute = createRoute({
      getParentRoute: () => RootRoute,
      path: '/crash',
      component: () => {
        throw new Error('Test crash');
      },
    });
    mountRoot('/crash', [crashRoute]);
    await waitFor(() => {
      expect(screen.getByText(/Algo ha fallado/i)).toBeInTheDocument();
    });
    spy.mockRestore();
  });
});
