import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { LoginForm } from '@/features/auth/login-form';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
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

    expect(await screen.findByText(/Email o contraseña incorrectos/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('al enviar vacío avisa de ambos campos (sin clic muerto) y no envía', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountLogin();

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escribe tu email o nombre de usuario')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
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
