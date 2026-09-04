import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { Onboarding } from '@/features/onboarding/Onboarding';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderOnboarding() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const onboardingR = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    component: Onboarding,
  });
  const stub = (path: string, id: string) =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div data-testid={id}>{id}</div>,
    });
  const tree = root.addChildren([
    onboardingR,
    stub('/login', 'login-screen'),
    stub('/register', 'register-screen'),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/onboarding'] }),
  });
  return render(
    <LanguageProvider>
      <ThemeProvider>
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </LanguageProvider>,
  );
}

describe('Onboarding', () => {
  it('renderiza el botón Empezar', async () => {
    renderOnboarding();
    expect(await screen.findByRole('button', { name: /Empezar/i })).toBeInTheDocument();
  });

  it('"Empezar" avanza de paso, no entra a la app', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Empezar/i }));
    const step = screen.getByRole('region', { name: /^Paso 1/i });
    expect(step).toHaveFocus();
    expect(within(step).getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ir a diapositiva 2/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByRole('button', { name: /Empezar/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-screen')).not.toBeInTheDocument();
  });

  it('Saltar marca el onboarding como visto y lleva a /login (una sola vez)', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    const skip = await screen.findByRole('button', { name: /Saltar/i });
    await user.click(skip);
    await user.click(skip);
    await user.click(skip);
    expect(localStorage.getItem('manualito.onboarding.seen')).toBe('1');
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });

  it('la pantalla de elección "Crear cuenta" lleva a /register', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    // Salto a la última diapositiva y continúo hasta la pantalla de elección.
    await user.click(await screen.findByRole('button', { name: /Ir a diapositiva 4/i }));
    await user.click(await screen.findByRole('button', { name: /Continuar/i }));
    await user.click(await screen.findByRole('button', { name: /Crear cuenta/i }));
    expect(await screen.findByTestId('register-screen')).toBeInTheDocument();
  });

  it('la pantalla de elección "Ya tengo cuenta" lleva a /login', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Ir a diapositiva 4/i }));
    await user.click(await screen.findByRole('button', { name: /Continuar/i }));
    await user.click(await screen.findByRole('button', { name: /Ya tengo cuenta/i }));
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
  });

  it('la política de privacidad se abre como modal, sin salir del onboarding', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Ir a diapositiva 4/i }));
    await user.click(await screen.findByRole('button', { name: /Continuar/i }));
    await user.click(await screen.findByRole('button', { name: /Política de privacidad/i }));
    const dialog = await screen.findByRole('dialog', { name: /Política de privacidad/i });
    expect(dialog).toBeInTheDocument();
    // Seguimos en el onboarding (no se navegó a /login ni /register).
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-screen')).not.toBeInTheDocument();
  });

  it('Enter en Ya tengo cuenta navega a login sin activar registro', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Ir a diapositiva 5/i }));
    screen.getByRole('button', { name: /Ya tengo cuenta/i }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('register-screen')).not.toBeInTheDocument();
  });

  it('cambiar idioma con Enter conserva el panel y oculta los demás del foco accesible', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    const language = await screen.findByRole('button', { name: /Switch language to English/i });
    language.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /Go to slide 1/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: /Cambiar el idioma a español/i })).toHaveFocus();
    expect(document.querySelectorAll('section[inert]')).toHaveLength(4);
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('Escape cierra privacidad y conserva el panel de elección', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(await screen.findByRole('button', { name: /Ir a diapositiva 5/i }));
    const privacy = screen.getByRole('button', { name: /Política de privacidad/i });
    await user.click(privacy);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(privacy).toHaveFocus();
    expect(screen.getByRole('button', { name: /Ir a diapositiva 5/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument();
  });
});
