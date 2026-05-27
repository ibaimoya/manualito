import { afterEach, describe, expect, it } from 'vitest';
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
import { ThemeProvider } from '@/app/theme';
import { Route as HistoryRoute } from './history';
import { storage, type ManualRecord } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
});

function seedManuals(rows: Array<Pick<ManualRecord, 'manual_id' | 'name'>>) {
  for (const r of rows) {
    storage.upsertManual({
      manual_id: r.manual_id,
      name: r.name,
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 10,
    });
  }
}

function renderHistory() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const historyR = createRoute({
    getParentRoute: () => root,
    path: '/history',
    component: (HistoryRoute as unknown as { options: { component: React.FC } }).options
      .component,
  });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: () => <div>SourceScreen</div>,
  });
  const tree = root.addChildren([historyR, sourceR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/history'] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/history', () => {
  it('empty state cuando no hay manuales (lazy initializer, sin flash)', async () => {
    renderHistory();
    // El componente lee de localStorage en el initializer de useState
    // (catálogo bug #33) — el empty state debe estar ya pintado en
    // el primer render, no tras un useEffect.
    expect(await screen.findByText(/Aún no hay manuales por aquí/)).toBeInTheDocument();
  });

  it('lista los manuales desde localStorage', async () => {
    seedManuals([
      { manual_id: '1', name: 'Catan' },
      { manual_id: '2', name: 'Wingspan' },
      { manual_id: '3', name: 'Parchís' },
    ]);
    renderHistory();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
    expect(screen.getByText('Parchís')).toBeInTheDocument();
  });

  it('busca por nombre (debounced ~150ms) y filtra el listado', async () => {
    seedManuals([
      { manual_id: '1', name: 'Catan' },
      { manual_id: '2', name: 'Wingspan' },
      { manual_id: '3', name: 'Parchís' },
    ]);
    renderHistory();
    const search = await screen.findByRole('searchbox', { name: /Buscar manuales/i });
    const user = userEvent.setup();
    await user.type(search, 'wing');
    // El filtrado real corre tras el debounce (150ms) — waitFor cubre eso.
    await waitFor(() => {
      expect(screen.queryByText('Catan')).not.toBeInTheDocument();
      expect(screen.queryByText('Parchís')).not.toBeInTheDocument();
      expect(screen.getByText('Wingspan')).toBeInTheDocument();
    });
  });

  it('cuando no hay coincidencias muestra el mensaje "ningún manual coincide"', async () => {
    seedManuals([{ manual_id: '1', name: 'Catan' }]);
    renderHistory();
    const search = await screen.findByRole('searchbox', { name: /Buscar manuales/i });
    const user = userEvent.setup();
    await user.type(search, 'xyz123');
    await waitFor(() => {
      expect(screen.getByText(/Ningún manual coincide/)).toBeInTheDocument();
    });
  });
});
