import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/theme';
import { Route as SettingsRoute } from '@/routes/_app.settings';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import type { AuthUser } from '@/shared/api/auth';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Estabilizar matchMedia para que useNamedMediaQuery('darkMode') no
  // dependa del entorno (jsdom no implementa matchMedia y nuestro setup
  // lo monkey-patcha a `matches: false`).
});

function renderSettings(user: AuthUser | null = null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Sembramos la sesión en cache para que useAuth no dispare fetch a /api/me.
  qc.setQueryData(AUTH_ME_KEY, user ? { user, csrf_token: 'demo' } : null);
  const root = createRootRoute({ component: Outlet });
  const settingsR = createRoute({
    getParentRoute: () => root,
    path: '/settings',
    component: (SettingsRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const tree = root.addChildren([settingsR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/settings'] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/settings', () => {
  it('renderiza las dos secciones principales: Apariencia y Privacidad y datos', async () => {
    renderSettings();
    expect(await screen.findByRole('region', { name: /Apariencia/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Privacidad y datos/i })).toBeInTheDocument();
  });

  it('muestra la sección de Cuenta con el usuario logueado (nombre, email, salir)', async () => {
    renderSettings({
      id: 'u1',
      email: 'marta@x.app',
      username: 'Marta',
      role: 'user',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      last_login_at: null,
      email_verified_at: '2026-01-01T00:00:00.000Z',
    });
    expect(await screen.findByRole('region', { name: /Cuenta/i })).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByText('marta@x.app')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salir/i })).toBeInTheDocument();
  });

  it('sin sesión en cache no monta la sección de Cuenta', async () => {
    renderSettings();
    await screen.findByRole('region', { name: /Apariencia/i });
    expect(screen.queryByRole('region', { name: /Cuenta/i })).not.toBeInTheDocument();
  });

  it('cambia el modo del tema usando el SegmentedControl (light/dark/auto)', async () => {
    renderSettings();
    const user = userEvent.setup();
    const modoGroup = await screen.findByRole('radiogroup', {
      name: /Modo de color/i,
    });
    const darkOption = await screen.findByRole('radio', { name: 'Oscuro' });
    await user.click(darkOption);
    expect(darkOption).toHaveAttribute('aria-checked', 'true');
    expect(modoGroup).toBeInTheDocument();
  });

  it('cambia el color de acento entre Ámbar y Azul', async () => {
    renderSettings();
    const user = userEvent.setup();
    const azul = await screen.findByRole('radio', { name: 'Azul' });
    await user.click(azul);
    expect(azul).toHaveAttribute('aria-checked', 'true');
  });

  it('muestra el hint del modo auto reflejando el tema del sistema', async () => {
    // El hint solo aparece en modo auto; el default ahora es claro, así que
    // seleccionamos Auto primero. matchMedia mock = "claro" según setup.
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Auto' }));
    expect(await screen.findByText(/Sigue el sistema/)).toBeInTheDocument();
  });

  it('muestra el indicador estático de archivos gestionados por servidor', async () => {
    renderSettings();
    expect(
      await screen.findByRole('status', { name: /Archivos gestionados/i }),
    ).toBeInTheDocument();
  });

  it('botón "Borrar todo" abre el alertdialog de confirmación', async () => {
    renderSettings();
    const user = userEvent.setup();

    const buttons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(buttons[0]!);
    expect(
      await screen.findByRole('alertdialog', { name: /Confirmar borrado/i }),
    ).toBeInTheDocument();
  });

  it('confirma el borrado: vacía manuales y onboarding seen', async () => {
    // Sembrar datos para verificar que se borran.
    storage.upsertManual({
      manual_id: 'm1',
      name: 'Catan',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 5,
    });
    storage.markOnboardingSeen();
    expect(storage.listManuals()).toHaveLength(1);
    expect(storage.isOnboardingSeen()).toBe(true);

    renderSettings();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(buttons[0]!);

    const allButtons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(allButtons[allButtons.length - 1]!);

    await waitFor(() => {
      expect(storage.listManuals()).toHaveLength(0);
      expect(storage.isOnboardingSeen()).toBe(false);
    });
  });

  it('cancela la confirmación → no borra ni cierra los datos', async () => {
    storage.upsertManual({
      manual_id: 'm1',
      name: 'Catan',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 5,
    });
    renderSettings();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: /Borrar todo/i }))[0]!);
    await user.click(await screen.findByRole('button', { name: /Cancelar/i }));
    expect(storage.listManuals()).toHaveLength(1);
    await waitFor(() => {
      expect(
        screen.queryByRole('alertdialog', { name: /Confirmar borrado/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('el footer enlaza a la política de privacidad', async () => {
    renderSettings();
    expect(
      await screen.findByRole('link', { name: /Política de privacidad/i }),
    ).toBeInTheDocument();
  });
});
