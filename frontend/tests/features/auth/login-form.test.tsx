import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { failLogin } from '@tests/_helpers/mswHandlers';
import { ThemeProvider } from '@/app/theme';
import i18n from '@/app/i18n';
import { LoginForm } from '@/features/auth/login-form';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners('request:start');
  localStorage.clear();
});
afterAll(() => server.close());

function mountLogin() {
  const onAuthenticated = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const login = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <LoginForm onAuthenticated={onAuthenticated} />,
  });
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <div>{path}</div> });
  const tree = root.addChildren([login, stub('/register'), stub('/forgot'), stub('/home')]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { onAuthenticated };
}

describe('LoginForm', () => {
  it('conserva el error al reintentar, evita envíos simultáneos y lo retira al entrar', async () => {
    server.use(failLogin());
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();
    await user.type(await screen.findByLabelText('Email o usuario'), 'marta');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura');
    const submit = screen.getByRole('button', { name: 'Entrar' });
    await user.click(submit);
    const alert = await screen.findByRole('alert');
    const reveal = alert.parentElement!.parentElement!;
    await waitFor(() => expect(reveal).toHaveStyle({ opacity: '1' }));
    const firstMessage = alert.textContent;

    // Controlamos la respuesta HTTP para observar un reintento todavía pendiente.
    const response = Promise.withResolvers<void>();
    let requests = 0;
    server.use(
      http.post('/api/auth/login', async () => {
        requests++;
        await response.promise;
        return HttpResponse.json({ detail: 'forced error' }, { status: 500 });
      }),
    );
    try {
      await user.click(submit);
      await waitFor(() => expect(requests).toBe(1));
      expect(submit).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('alert')).toBe(alert);
      expect(reveal).not.toHaveAttribute('inert');
      expect(reveal).toHaveStyle({ opacity: '1' });
      for (let i = 0; i < 20; i++) fireEvent.submit(submit.closest('form')!);
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(requests).toBe(1);
    } finally {
      response.resolve();
    }
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getAllByRole('alert')).toEqual([alert]);
    expect(alert.textContent).not.toBe(firstMessage);
    server.resetHandlers();
    await user.click(submit);
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('muestra el enlace de recuperar contraseña en español de España', async () => {
    mountLogin();

    expect(
      await screen.findByRole('link', { name: '¿Has olvidado tu contraseña?' }),
    ).toHaveAttribute('href', '/forgot');
  });

  it('inicia sesión con credenciales válidas y avisa al terminar', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.type(await screen.findByLabelText('Email o usuario'), 'marta');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('muestra error y no continúa si las credenciales fallan (401)', async () => {
    server.use(failLogin(401));
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.type(await screen.findByLabelText('Email o usuario'), 'marta');
    await user.type(screen.getByLabelText('Contraseña'), 'mala');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('El email, el nombre de usuario o la contraseña no son correctos.'),
    ).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('traduce el error del servidor y lo actualiza al cambiar de idioma sin reenviar', async () => {
    let loginRequests = 0;
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname === '/api/auth/login') loginRequests++;
    });
    server.use(failLogin());
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.type(await screen.findByLabelText('Email or username'), 'marta');
    await user.type(screen.getByLabelText('Password'), 'incorrect');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const english = 'The email, username or password is incorrect.';
    const spanish = 'El email, el nombre de usuario o la contraseña no son correctos.';
    await waitFor(() => expect(screen.getByText(english)).toBeVisible());
    expect(loginRequests).toBe(1);
    expect(screen.queryByText('Credenciales inválidas.')).not.toBeInTheDocument();

    await act(() => i18n.changeLanguage('es'));
    expect(screen.getByText(spanish)).toBeVisible();
    expect(screen.queryByText(english)).not.toBeInTheDocument();

    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText(english)).toBeVisible();
    expect(screen.queryByText(spanish)).not.toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(loginRequests).toBe(1);
  });

  it('al enviar vacío avisa de ambos campos (sin clic muerto) y no envía', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu email o nombre de usuario')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument();
    expect(screen.getByLabelText('Email o usuario')).toHaveFocus();
    expect(screen.getByLabelText('Email o usuario')).toHaveAccessibleDescription(
      'Escribe tu email o nombre de usuario',
    );
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription(
      'Escribe tu contraseña',
    );
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('retira el aviso accesible al corregir y permite invalidar de nuevo durante la salida', async () => {
    const user = userEvent.setup();
    mountLogin();
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    const identifier = screen.getByLabelText('Email o usuario');

    await user.type(identifier, 'm');
    expect(identifier).not.toHaveAttribute('aria-invalid');
    expect(identifier).not.toHaveAccessibleDescription();

    await user.clear(identifier);
    expect(identifier).toHaveAccessibleDescription('Escribe tu email o nombre de usuario');
    expect(screen.getAllByText('Escribe tu email o nombre de usuario')).toHaveLength(1);

    await user.type(identifier, 'marta');
    await waitFor(() => {
      expect(screen.queryByText('Escribe tu email o nombre de usuario')).not.toBeInTheDocument();
    });
  });

  it('con identificador pero sin contraseña, avisa solo de la contraseña', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.type(await screen.findByLabelText('Email o usuario'), 'marta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu contraseña')).toBeInTheDocument();
    expect(screen.queryByText('Escribe tu email o nombre de usuario')).not.toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('un identificador solo de espacios no cuenta como válido', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.type(await screen.findByLabelText('Email o usuario'), '   ');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu email o nombre de usuario')).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
