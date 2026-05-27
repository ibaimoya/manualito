import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { ThemeProvider } from '@/app/theme';
import { Route as HomeRoute } from './home';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
});

function renderHome() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const homeR = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: (HomeRoute as unknown as { options: { component: React.FC } }).options
      .component,
  });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: () => <div>SourceScreen</div>,
  });
  const settingsR = createRoute({
    getParentRoute: () => root,
    path: '/settings',
    component: () => <div>SettingsScreen</div>,
  });
  const historyR = createRoute({
    getParentRoute: () => root,
    path: '/history',
    component: () => <div>HistoryScreen</div>,
  });
  const resultR = createRoute({
    getParentRoute: () => root,
    path: '/result/$manualId',
    component: () => <div>ResultScreen</div>,
  });
  const tree = root.addChildren([homeR, sourceR, settingsR, historyR, resultR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/home', () => {
  it('saludo + CTA "Nuevo manual" presente', async () => {
    renderHome();
    expect(await screen.findByText(/¿Qué juego vamos a aprender\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo manual/i })).toBeInTheDocument();
  });

  it('el CTA principal apunta a /capture/source (no a /capture directo)', async () => {
    renderHome();
    const link = await screen.findByRole('link', { name: /Nuevo manual/i });
    expect(link).toHaveAttribute('href', '/capture/source');
  });

  it('cuando no hay manuales muestra el empty state con la copia actualizada', async () => {
    renderHome();
    // El texto está partido por un <strong> dentro del <p>; usamos el textContent
    // del párrafo entero para detectar la frase completa.
    const para = await screen.findByText(/Aún no has consultado/, { selector: 'p' });
    expect(para.textContent).toMatch(/Pulsa\s+Nuevo manual\s+para empezar/);
  });

  it('muestra recientes desde localStorage', async () => {
    storage.upsertManual({
      manual_id: 'a',
      name: 'Catan',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 12,
    });
    renderHome();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.queryByText(/Pulsa Nuevo manual para empezar/)).not.toBeInTheDocument();
  });
});
