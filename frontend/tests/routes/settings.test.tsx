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
import { Route as SettingsRoute } from '@/routes/settings';
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

function renderSettings() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const settingsR = createRoute({
    getParentRoute: () => root,
    path: '/settings',
    component: (
      SettingsRoute as unknown as { options: { component: React.FC } }
    ).options.component,
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
    expect(
      screen.getByRole('region', { name: /Privacidad y datos/i }),
    ).toBeInTheDocument();
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

  it('cambia la densidad entre Compacta y Cómoda', async () => {
    renderSettings();
    const user = userEvent.setup();
    const compacta = await screen.findByRole('radio', { name: 'Compacta' });
    await user.click(compacta);
    expect(compacta).toHaveAttribute('aria-checked', 'true');
  });

  it('cambia el color de acento entre Ámbar y Azul', async () => {
    renderSettings();
    const user = userEvent.setup();
    const azul = await screen.findByRole('radio', { name: 'Azul' });
    await user.click(azul);
    expect(azul).toHaveAttribute('aria-checked', 'true');
  });

  it('muestra el hint del modo auto reflejando el tema del sistema', async () => {
    // Modo auto por defecto + matchMedia mock = "claro" según setup.
    renderSettings();
    expect(
      await screen.findByText(/Sigue el sistema/),
    ).toBeInTheDocument();
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

  it('muestra la versión + footer técnico', async () => {
    renderSettings();
    const para = await screen.findByText(/v 0\.1\.0/);
    expect(para.textContent).toMatch(/phi4/);
    expect(para.textContent).toMatch(/ChromaDB/);
  });
});
