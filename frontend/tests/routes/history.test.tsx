import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { Route as HistoryRoute } from '@/routes/_app.history';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function manual(id: string, name: string) {
  return {
    id,
    game_id: `g-${id}`,
    game_name: name,
    title: name,
    status: 'active',
    visibility: 'private',
    language: 'spa',
    chunks_indexed: 10,
    created_at: '2026-05-26T10:00:00.000Z',
    indexed_at: '2026-05-26T10:00:10.000Z',
  };
}

function withManuals(...names: string[]) {
  const rows = names.map((n, i) => manual(`m${i + 1}`, n));
  return http.get('/api/manuals', () => HttpResponse.json({ manuals: rows }));
}

function renderHistory() {
  return renderRoute({
    path: '/history',
    initialEntry: '/history',
    component: routeComponent(HistoryRoute),
    stubs: {
      '/capture/source': 'SourceScreen',
      '/game/$gameId': 'GameHubScreen',
      '/processing/$manualId': 'ProcessingScreen',
    },
  });
}

describe('/history', () => {
  it('empty state cuando no hay manuales', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [] })));
    renderHistory();
    expect(await screen.findByText(/Aún no hay manuales por aquí/)).toBeInTheDocument();
  });

  it('lista los manuales desde el backend', async () => {
    server.use(withManuals('Catan', 'Wingspan', 'Parchís'));
    renderHistory();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
    expect(screen.getByText('Parchís')).toBeInTheDocument();
  });

  it('el typeahead sugiere juegos y al elegir navega al hub del juego', async () => {
    server.use(withManuals('Catan', 'Wingspan', 'Parchís'));
    renderHistory();
    const user = userEvent.setup();
    const search = await screen.findByRole('combobox', { name: /Buscar tus juegos/i });
    await user.type(search, 'wing');
    const results = await screen.findByLabelText('Tus juegos');
    await user.click(within(results).getByRole('button', { name: /Wingspan/i }));
    expect(await screen.findByText('GameHubScreen')).toBeInTheDocument();
  });

  it('el typeahead avisa cuando ningún juego coincide', async () => {
    server.use(withManuals('Catan'));
    renderHistory();
    const search = await screen.findByRole('combobox', { name: /Buscar tus juegos/i });
    await userEvent.setup().type(search, 'xyz123');
    expect(await screen.findByText(/Ningún juego coincide/)).toBeInTheDocument();
  });

  it('Borrar abre confirm; cancelar mantiene el manual', async () => {
    server.use(withManuals('Catan'));
    renderHistory();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Borrar Catan/i }));
    expect(await screen.findByText(/¿Borrar Catan\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.getByText('Catan')).toBeInTheDocument();
  });

  it('confirmar el borrado lo elimina del listado (optimista + refetch)', async () => {
    // Handlers con estado: el DELETE quita la fila que lee el GET, para que el
    // refetch tras invalidar no resucite el manual borrado.
    let rows = [manual('m1', 'Catan'), manual('m2', 'Wingspan')];
    server.use(
      http.get('/api/manuals', () => HttpResponse.json({ manuals: rows })),
      http.delete('/api/manuals/:id', ({ params }) => {
        rows = rows.filter((m) => m.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderHistory();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Borrar Catan/i }));
    await user.click(await screen.findByRole('button', { name: /^Borrar$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Catan')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
  });

  it('empty state expone un CTA al primer upload (link a /capture/source)', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [] })));
    renderHistory();
    const link = await screen.findByRole('link', { name: /Subir mi primer manual/i });
    expect(link).toHaveAttribute('href', '/capture/source');
  });
});
