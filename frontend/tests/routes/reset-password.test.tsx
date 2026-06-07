import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { Route as ResetRoute } from '@/routes/reset-password';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderReset(token?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const resetR = createRoute({
    getParentRoute: () => root,
    path: '/reset-password',
    validateSearch: (search) => ({
      token: typeof search.token === 'string' ? search.token : undefined,
    }),
    component: (ResetRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const stub = (path: string, id: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div data-testid={id}>{id}</div>,
    });
  const tree = root.addChildren([resetR, stub('/login', 'login'), stub('/forgot', 'forgot')]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [token ? `/reset-password?token=${token}` : '/reset-password'],
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

describe('/reset-password', () => {
  it('sin token muestra "Enlace no válido"', async () => {
    renderReset();
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });

  it('con token válido guarda y muestra éxito', async () => {
    const user = userEvent.setup();
    renderReset('tok');
    await user.type(await screen.findByLabelText('Nueva contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura99');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Contraseña actualizada')).toBeInTheDocument();
  });

  it('token caducado/inválido → estado de error', async () => {
    server.use(
      http.post('/api/auth/password/reset', () =>
        HttpResponse.json({ detail: 'expired' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderReset('tok');
    await user.type(await screen.findByLabelText('Nueva contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura99');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByText('Este enlace ya no vale')).toBeInTheDocument();
  });

  it('contraseñas distintas → muestra el aviso de coincidencia', async () => {
    const user = userEvent.setup();
    renderReset('tok');
    await user.type(await screen.findByLabelText('Nueva contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'otra12345');
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
  });
});
