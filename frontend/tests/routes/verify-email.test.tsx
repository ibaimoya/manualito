import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { ThemeProvider } from '@/app/theme';
import { Route as VerifyRoute } from '@/routes/verify-email';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderVerify(token?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const verifyR = createRoute({
    getParentRoute: () => root,
    path: '/verify-email',
    validateSearch: (search) => ({
      token: typeof search.token === 'string' ? search.token : undefined,
    }),
    component: (VerifyRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const stub = (path: string, id: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div data-testid={id}>{id}</div>,
    });
  const tree = root.addChildren([verifyR, stub('/login', 'login'), stub('/home', 'home')]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [token ? `/verify-email?token=${token}` : '/verify-email'],
    }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/verify-email', () => {
  it('sin token → "Enlace no válido"', async () => {
    renderVerify();
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });

  it('token válido → "¡Email verificado!"', async () => {
    renderVerify('tok');
    expect(await screen.findByText('¡Email verificado!')).toBeInTheDocument();
  });

  it('token inválido (400) → "Enlace no válido"', async () => {
    server.use(
      http.post('/api/auth/email/verify', () =>
        HttpResponse.json({ detail: 'bad' }, { status: 400 }),
      ),
    );
    renderVerify('tok');
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });
});
