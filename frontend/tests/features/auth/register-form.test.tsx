import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import i18n from '@/app/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { server } from '@tests/_helpers/server';
import { failRegister, failRegisterValidation } from '@tests/_helpers/mswHandlers';
import { ThemeProvider } from '@/app/theme';
import i18n from '@/app/i18n';
import { RegisterForm } from '@/features/auth/register-form';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners('request:start');
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
  it('envía el idioma elegido al terminar el formulario', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ detail: 'unavailable' }, { status: 503 });
      }),
    );
    const user = userEvent.setup();
    mountRegister();
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await act(() => i18n.changeLanguage('en'));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await waitFor(() => expect(body).toMatchObject({ email: 'marta@gmail.com', locale: 'en' }));
  });

  it('asocia el consentimiento completo al checkbox y permite activarlo desde su texto', async () => {
    const user = userEvent.setup();
    mountRegister();
    const checkbox = await screen.findByRole('checkbox', {
      name: /^He leído y acepto la Política de privacidad\s*\.$/,
    });

    await user.click(screen.getByText('He leído y acepto la', { exact: true }));
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveFocus();
  });

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

  it('ante un 409 avisa de email O usuario en uso (sin asumir cuál) y no continúa', async () => {
    server.use(failRegister(409));
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    // El backend no distingue email de usuario en un 409 → el mensaje cubre ambos.
    expect(await screen.findByText(/email o usuario ya está en uso/i)).toBeInTheDocument();
    // Regresión: no debe afirmar que es el email (el conflicto pudo ser el usuario).
    expect(screen.queryByText(/Ese email ya está registrado/i)).not.toBeInTheDocument();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('traduce un error de campo 422 y lo mantiene en el idioma seleccionado', async () => {
    server.use(failRegisterValidation());
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await fillValid(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(
      await screen.findByText('El nombre de usuario contiene un carácter no permitido.'),
    ).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
    expect(
      screen.getByText('The username contains a character that is not allowed.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/El nombre de usuario contiene/)).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Repite la contraseña')).toHaveFocus();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('mantiene el aviso de email inválido y no registra', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();

    await user.type(await screen.findByLabelText('Email'), 'marta.example.com');
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura99');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ese email no parece válido')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('acepta email con espacios alrededor (se recorta) y registra', async () => {
    const submissions: Promise<unknown>[] = [];
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname === '/api/auth/register') {
        submissions.push(request.clone().json());
      }
    });
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await user.type(await screen.findByLabelText('Email'), '  marta@gmail.com  ');
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura99');
    await user.type(screen.getByLabelText('Repite la contraseña'), 'claveSegura99');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    expect(await Promise.all(submissions)).toEqual([
      expect.objectContaining({ email: 'marta@gmail.com' }),
    ]);
  });

  it('acepta una contraseña de exactamente 12 caracteres (límite inferior)', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await user.type(await screen.findByLabelText('Email'), 'marta@gmail.com');
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
    await user.type(screen.getByLabelText('Contraseña'), 'doceCaract12'); // 12 chars
    await user.type(screen.getByLabelText('Repite la contraseña'), 'doceCaract12');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
  });

  it('rechaza una contraseña de 11 caracteres (bajo el mínimo) y no registra', async () => {
    const user = userEvent.setup();
    const { onAuthenticated } = mountRegister();
    await user.type(await screen.findByLabelText('Email'), 'marta@gmail.com');
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Marta');
    await user.type(screen.getByLabelText('Contraseña'), 'onceCarac11'); // 11 chars
    await user.type(screen.getByLabelText('Repite la contraseña'), 'onceCarac11');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
