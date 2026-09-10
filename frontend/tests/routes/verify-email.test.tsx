import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
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
    <LanguageProvider>
      <ThemeProvider>
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </LanguageProvider>,
  );
}

describe('/verify-email', () => {
  it('sin token → "Enlace no válido"', async () => {
    renderVerify();
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });

  it('confirma el correo y permite abrir y cerrar el sobre sin bloquear continuar', async () => {
    const user = userEvent.setup();
    renderVerify('tok');
    const heading = await screen.findByRole('heading', { name: 'Correo verificado' });
    await waitFor(() => expect(heading).toHaveFocus());
    const envelope = screen.getByRole('button', { name: 'Abrir el sobre' });
    expect(envelope).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'Continuar' })).toHaveAttribute('href', '/home');

    await user.click(envelope);
    expect(screen.getByRole('button', { name: 'Cerrar el sobre' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(envelope).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Abrir el sobre' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.keyboard('{Enter}');
    expect(envelope).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: 'Continuar' }));
    expect(await screen.findByTestId('home')).toBeInTheDocument();
  });

  it.each([400, 422])('un token rechazado con %i muestra el enlace inválido', async (status) => {
    server.use(
      http.post('/api/auth/email/verify', () => HttpResponse.json({ detail: 'bad' }, { status })),
    );
    renderVerify('tok');
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });

  it('reconoce el código de enlace inválido aunque cambie el estado HTTP', async () => {
    server.use(
      http.post('/api/auth/email/verify', () =>
        HttpResponse.json(
          { errors: [{ code: 'email_verification_token_invalid' }] },
          { status: 409 },
        ),
      ),
    );
    renderVerify('tok');
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a intentarlo' })).not.toBeInTheDocument();
  });

  it.each(['servidor', 'red'])(
    'permite recuperar un fallo de %s con el mismo enlace',
    async (failure) => {
      const retryResponse = Promise.withResolvers<void>();
      const submissions: unknown[] = [];
      server.use(
        http.post('/api/auth/email/verify', async ({ request }) => {
          submissions.push(await request.json());
          if (submissions.length === 1) {
            return failure === 'red'
              ? HttpResponse.error()
              : HttpResponse.json({ detail: 'temporary' }, { status: 503 });
          }
          await retryResponse.promise;
          return HttpResponse.json({ detail: 'ok' });
        }),
      );
      const user = userEvent.setup();
      renderVerify('valid-token');
      const heading = await screen.findByRole('heading', {
        name: 'No hemos podido verificar tu correo',
      });
      expect(screen.queryByText('Enlace no válido')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Abrir el sobre' }));
      await user.click(screen.getByRole('button', { name: 'Volver a intentarlo' }));

      expect(await screen.findByRole('button', { name: 'Volver a intentarlo' })).toBeDisabled();
      expect(heading).toBeInTheDocument();
      expect(screen.queryByText('Enlace no válido')).not.toBeInTheDocument();
      await act(async () => retryResponse.resolve());

      const success = await screen.findByRole('heading', { name: 'Correo verificado' });
      await waitFor(() => expect(success).toHaveFocus());
      expect(screen.getByRole('button', { name: 'Cerrar el sobre' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      expect(submissions).toEqual([{ token: 'valid-token' }, { token: 'valid-token' }]);
    },
  );

  it('cambiar el idioma no devuelve el foco al encabezado del estado', async () => {
    const user = userEvent.setup();
    renderVerify('tok');
    await screen.findByRole('heading', { name: 'Correo verificado' });
    const language = screen.getByRole('button', { name: 'Switch language to English' });
    await user.click(language);
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
    expect(language).toHaveFocus();
  });
});
