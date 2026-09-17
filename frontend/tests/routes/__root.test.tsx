import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { Route as RootRoute } from '@/routes/__root';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  vi.restoreAllMocks();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

/** La sesión usa la frontera HTTP de MSW. El router y los providers son reales. */
function mountRoot(initialPath: string, leaves: AnyRoute[]) {
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
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </LanguageProvider>
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

  it('ofrece una salida al inicio cuando la página no existe', async () => {
    mountRoot('/no-existe-12345', [homePage]);
    const heading = await screen.findByRole('heading', {
      name: 'Esta página no está en el manual',
    });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(within(screen.getByRole('main')).getByRole('link', { name: /inicio/i })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('presenta la recuperación cuando falla el render de una ruta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const crashRoute = createRoute({
      getParentRoute: () => RootRoute,
      path: '/crash',
      component: () => {
        throw new Error('Test crash');
      },
    });
    mountRoot('/crash', [crashRoute]);
    expect(
      await screen.findByRole('heading', { name: 'No hemos podido abrir esta página' }),
    ).toBeInTheDocument();
  });

  it('recupera una página cuyo loader falló al reintentar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const retry = Promise.withResolvers<void>();
    let firstLoad = true;
    const recoveryRoute = createRoute({
      getParentRoute: () => RootRoute,
      path: '/recovery',
      loader: () => {
        if (firstLoad) {
          firstLoad = false;
          throw new Error('No se pudo cargar la página');
        }
        return retry.promise;
      },
      component: () => <h1>Página recuperada</h1>,
    });
    mountRoot('/recovery', [recoveryRoute]);
    const button = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(button);
    expect(screen.queryByRole('heading', { name: 'Página recuperada' })).not.toBeInTheDocument();

    await act(async () => retry.resolve());
    expect(await screen.findByRole('heading', { name: 'Página recuperada' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
