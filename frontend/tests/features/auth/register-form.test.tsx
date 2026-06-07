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
import { failRegister } from '@tests/_helpers/mswHandlers';
import { ThemeProvider } from '@/app/theme';
import { RegisterForm } from '@/features/auth/register-form';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function mountRegister() {
  const onAuthenticated = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const register = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <RegisterForm onAuthenticated={onAuthenticated} />,
  });
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <div>{path}</div> });
  const tree = root.addChildren([register, stub('/login'), stub('/home')]);
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

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), 'marta@gmail.com');
  await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
  await user.type(screen.getByLabelText('Contraseña'), 'claveSegura99');
  await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura99');
}

describe('RegisterForm', () => {
  it('avisa si falta el consentimiento y registra al aceptarlo', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await fillValid(user);

    const submit = screen.getByRole('button', { name: 'Crear cuenta' });
    await user.click(submit);
    expect(await screen.findByText(/Debes aceptar la política/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox'));
    await user.click(submit);
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('muestra "ya registrado" ante un 409 y no continúa', async () => {
    server.use(failRegister(409));
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText(/ya está registrado/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('avisa si las contraseñas no coinciden y no registra', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await user.type(await screen.findByLabelText('Email'), 'marta@gmail.com');
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura98');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
