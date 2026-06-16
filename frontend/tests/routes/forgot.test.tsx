import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as ForgotRoute } from '@/routes/_public.forgot';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderForgot() {
  return renderRoute({
    path: '/forgot',
    initialEntry: '/forgot',
    component: routeComponent(ForgotRoute),
    stubs: { '/login': 'LoginScreen' },
    user: null,
  });
}

describe('/forgot', () => {
  it('no envía nada si el email está vacío', async () => {
    let requests = 0;
    server.use(
      http.post('/api/auth/password/forgot', () => {
        requests += 1;
        return HttpResponse.json({ detail: 'ok' });
      }),
    );

    const user = userEvent.setup();
    renderForgot();

    await user.click(await screen.findByRole('button', { name: 'Enviar enlace' }));

    expect(requests).toBe(0);
    expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeInTheDocument();
  });

  it('recorta el email, muestra carga y termina en estado de éxito', async () => {
    let releaseBackend!: () => void;
    const backendReady = new Promise<void>((resolve) => {
      releaseBackend = resolve;
    });
    let sentEmail: string | undefined;
    server.use(
      http.post('/api/auth/password/forgot', async ({ request }) => {
        sentEmail = ((await request.json()) as { email?: string }).email;
        await backendReady;
        return HttpResponse.json({
          detail: 'Si existe una cuenta con ese email, enviaremos instrucciones.',
        });
      }),
    );

    const user = userEvent.setup();
    renderForgot();

    await user.type(await screen.findByLabelText('Email'), '  ana@example.com  ');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled();
    expect(sentEmail).toBe('ana@example.com');

    releaseBackend();
    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a entrar' })).toHaveAttribute(
      'href',
      '/login',
    );
    await waitFor(() => expect(screen.queryByText('Enviando…')).not.toBeInTheDocument());
  });
});
