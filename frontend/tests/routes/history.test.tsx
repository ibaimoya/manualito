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
    source_type: 'pdf',
    page_count: 8,
    language: 'spa',
    chunks_indexed: 10,
    created_at: '2026-05-26T10:00:00.000Z',
    indexed_at: '2026-05-26T10:00:10.000Z',
  };
}

function libraryGame(id: string, name: string) {
  return {
    id,
    name,
    bgg_id: null,
    year_published: null,
    manuals_count: 1,
    conversations_count: 0,
    last_activity_at: '2026-05-26T10:00:00.000Z',
  };
}

function withManuals(...names: string[]) {
  const rows = names.map((n, i) => manual(`m${i + 1}`, n));
  return http.get('/api/manuals', () => HttpResponse.json({ manuals: rows }));
}

function withGames(...names: string[]) {
  const rows = names.map((n, i) => libraryGame(`g${i + 1}`, n));
  return http.get('/api/games/mine', () => HttpResponse.json({ games: rows }));
}

const NO_GAMES = http.get('/api/games/mine', () => HttpResponse.json({ games: [] }));
const NO_MANUALS = http.get('/api/manuals', () => HttpResponse.json({ manuals: [] }));

function renderHistory() {
  return renderRoute({
    path: '/history',
    initialEntry: '/history',
    component: routeComponent(HistoryRoute),
    stubs: {
      '/capture/source': 'SourceScreen',
      '/explore': 'ExploreScreen',
      '/game/$gameId': 'GameHubScreen',
      '/manual/$manualId': 'ManualEditScreen',
      '/processing/$manualId': 'ProcessingScreen',
    },
  });
}

async function goToManuals(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: 'Manuales' }));
}

describe('/history', () => {
  it('Juegos vacío: estado vacío con CTA a Explorar', async () => {
    server.use(NO_GAMES, NO_MANUALS);
    renderHistory();
    expect(await screen.findByText(/Aún no sigues ningún juego/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Explorar juegos/i });
    expect(link).toHaveAttribute('href', '/explore');
  });

  it('vista Juegos: lista los juegos y enlaza a su hub', async () => {
    server.use(withGames('Catan', 'Wingspan'), NO_MANUALS);
    renderHistory();
    const catan = await screen.findByRole('link', { name: /Abrir Catan/i });
    expect(catan).toHaveAttribute('href', '/game/g1');
    expect(screen.getByRole('link', { name: /Abrir Wingspan/i })).toBeInTheDocument();
  });

  it('vista Juegos: el buscador sugiere y salta al hub del juego', async () => {
    server.use(withGames('Catan', 'Wingspan', 'Parchís'), NO_MANUALS);
    renderHistory();
    const user = userEvent.setup();
    const search = await screen.findByRole('combobox', { name: /Saltar a un juego/i });
    await user.type(search, 'wing');
    const results = await screen.findByLabelText('Tus juegos');
    await user.click(within(results).getByRole('button', { name: /Wingspan/i }));
    expect(await screen.findByText('GameHubScreen')).toBeInTheDocument();
  });

  it('vista Juegos: el buscador avisa cuando ningún juego coincide', async () => {
    server.use(withGames('Catan'), NO_MANUALS);
    renderHistory();
    const user = userEvent.setup();
    const search = await screen.findByRole('combobox', { name: /Saltar a un juego/i });
    await user.type(search, 'xyz123');
    expect(await screen.findByText(/Ningún juego coincide/)).toBeInTheDocument();
  });

  it('cambiar a Manuales lista los manuales del backend', async () => {
    server.use(NO_GAMES, withManuals('Catan', 'Wingspan', 'Parchís'));
    renderHistory();
    const user = userEvent.setup();
    await screen.findByText(/Aún no sigues ningún juego/);
    await goToManuals(user);
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
    expect(screen.getByText('Parchís')).toBeInTheDocument();
  });

  it('en Manuales, el filtro acota la lista por nombre', async () => {
    server.use(NO_GAMES, withManuals('Catan', 'Wingspan', 'Parchís'));
    renderHistory();
    const user = userEvent.setup();
    await goToManuals(user);
    const filter = await screen.findByRole('searchbox', { name: /Filtrar tus manuales/i });
    await user.type(filter, 'wing');
    await waitFor(() => expect(screen.queryByText('Catan')).not.toBeInTheDocument());
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
  });

  it('en Manuales, Borrar abre confirm; cancelar mantiene el manual', async () => {
    server.use(NO_GAMES, withManuals('Catan'));
    renderHistory();
    const user = userEvent.setup();
    await goToManuals(user);
    await user.click(await screen.findByRole('button', { name: /Borrar Catan/i }));
    expect(await screen.findByText(/¿Borrar este manual de Catan\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(screen.getByText('Catan')).toBeInTheDocument();
  });

  it('en Manuales, confirmar el borrado lo elimina (optimista + refetch)', async () => {
    let rows = [manual('m1', 'Catan'), manual('m2', 'Wingspan')];
    server.use(
      NO_GAMES,
      http.get('/api/manuals', () => HttpResponse.json({ manuals: rows })),
      http.delete('/api/manuals/:id', ({ params }) => {
        rows = rows.filter((m) => m.id !== params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderHistory();
    const user = userEvent.setup();
    await goToManuals(user);
    await user.click(await screen.findByRole('button', { name: /Borrar Catan/i }));
    await user.click(await screen.findByRole('button', { name: /^Borrar$/i }));
    await waitFor(() => {
      expect(screen.queryByText('Catan')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Wingspan')).toBeInTheDocument();
  });
});
