import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { Route as HomeRoute } from '@/routes/_app.home';
import { DISCOVER_GAMES_KEY, discoverGamesQueryOptions } from '@/features/games/use-discover-games';
import { manualsQueryOptions } from '@/features/manual/use-manuals';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function manual(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    game_id: 'g1',
    game_name: 'Catan',
    title: 'Catan',
    status: 'active',
    visibility: 'private',
    language: 'spa',
    chunks_indexed: 12,
    created_at: '2026-05-26T10:00:00.000Z',
    indexed_at: '2026-05-26T10:00:10.000Z',
    ...overrides,
  };
}

function renderHome() {
  return renderRoute({
    path: '/home',
    initialEntry: '/home',
    component: routeComponent(HomeRoute),
    stubs: {
      '/capture/source': 'SourceScreen',
      '/settings': 'SettingsScreen',
      '/history': 'HistoryScreen',
    },
  });
}

describe('/home', () => {
  it('conserva el aviso mientras reintenta y muestra los manuales al recuperarse', async () => {
    server.use(http.get('/api/manuals', () => new HttpResponse(null, { status: 500 })));
    renderHome();
    const notice = await screen.findByRole('region', { name: 'Tus manuales no se han cargado' });
    const button = within(notice).getByRole('button', { name: 'Reintentar' });
    const response = Promise.withResolvers<void>();
    server.use(
      http.get('/api/manuals', async () => {
        await response.promise;
        return HttpResponse.json({ manuals: [manual()] });
      }),
    );

    await userEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toBeDisabled();
    expect(notice).toBeInTheDocument();
    expect(screen.queryByText(/Aún no has consultado/)).not.toBeInTheDocument();

    response.resolve();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(notice).not.toBeInTheDocument();
  });

  it('mantiene los recientes cacheados si falla una actualización', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })));
    const { qc } = renderHome();
    await screen.findByRole('region', { name: 'Recientes' });
    server.use(http.get('/api/manuals', () => new HttpResponse(null, { status: 500 })));
    await qc.invalidateQueries({ queryKey: ['manuals', 'list'] });
    await waitFor(() => expect(qc.getQueryState(['manuals', 'list'])?.status).toBe('error'));
    expect(
      within(screen.getByRole('region', { name: 'Recientes' })).getByText('Catan'),
    ).toBeInTheDocument();
  });

  it('saludo + CTA "Nuevo manual" presente', async () => {
    renderHome();
    expect(await screen.findByText(/¿Qué juego vamos a aprender\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo manual/i })).toBeInTheDocument();
  });

  it('el CTA principal apunta a /capture/source', async () => {
    renderHome();
    const link = await screen.findByRole('link', { name: /Nuevo manual/i });
    expect(link).toHaveAttribute('href', '/capture/source');
  });

  it('mantiene el estado vacío conocido si falla una actualización', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [] })));
    const { qc } = renderHome();
    const para = await screen.findByText(/Aún no has consultado/, { selector: 'p' });
    expect(para.textContent).toMatch(/Pulsa\s+Nuevo manual\s+para empezar/);
    expect(await screen.findByRole('link', { name: 'Ver Carcassonne' })).toHaveAttribute(
      'href',
      '/game/rec-1',
    );
    server.use(http.get('/api/manuals', () => new HttpResponse(null, { status: 500 })));
    const { queryKey } = manualsQueryOptions();
    await qc.invalidateQueries({ queryKey });
    await waitFor(() => expect(qc.getQueryState(queryKey)?.status).toBe('error'));
    expect(para).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('oculta el descubrimiento cuando no hay juegos compartidos', async () => {
    server.use(
      http.get('/api/games/discover', () => HttpResponse.json({ games: [], attribution: '' })),
    );
    const { qc } = renderHome();
    await waitFor(() =>
      expect(qc.getQueriesData({ queryKey: DISCOVER_GAMES_KEY }).map(([, data]) => data)).toEqual([
        [],
      ]),
    );
    expect(screen.queryByRole('heading', { name: 'Sugerencias' })).not.toBeInTheDocument();
  });

  it('muestra los manuales recientes desde el backend', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })));
    renderHome();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.queryByText(/Pulsa Nuevo manual para empezar/)).not.toBeInTheDocument();
  });

  it('excluye solo los juegos de los seis recientes, también al mezclar', async () => {
    const requests: string[][] = [];
    const manuals = Array.from({ length: 7 }, (_, index) =>
      manual({
        id: `m${index}`,
        game_id: `g${index}`,
        game_name: `Juego ${index}`,
        title: `Juego ${index}`,
      }),
    );
    const games = [
      { id: 'g6', name: 'Juego 6', manuals_count: 1 },
      { id: 'new', name: 'Nuevo', manuals_count: 1 },
    ];
    server.use(
      http.get('/api/manuals', () => HttpResponse.json({ manuals })),
      http.get('/api/games/discover', ({ request }) => {
        requests.push(new URL(request.url).searchParams.getAll('exclude_game_ids'));
        return HttpResponse.json({ games });
      }),
    );
    const { qc } = renderHome();
    qc.setQueryData(discoverGamesQueryOptions().queryKey, [
      { id: 'g0', name: 'Juego 0', manuals_count: 1, bgg_id: null, year_published: null },
    ]);
    const suggestions = await screen.findByRole('region', { name: 'Sugerencias' });
    expect(
      await within(suggestions).findByRole('link', { name: 'Ver Juego 6' }),
    ).toBeInTheDocument();
    expect(within(suggestions).queryByText('Juego 0')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Recientes' })).queryByText('Juego 6'),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(suggestions).getByRole('button', { name: 'Ver otras sugerencias' }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests).toEqual([
      ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'],
      ['g0', 'g1', 'g2', 'g3', 'g4', 'g5'],
    ]);
    expect(qc.getQueryData(discoverGamesQueryOptions().queryKey)).toEqual([
      { id: 'g0', name: 'Juego 0', manuals_count: 1, bgg_id: null, year_published: null },
    ]);
  });

  it('oculta sugerencias si todos los candidatos están en recientes', async () => {
    server.use(
      http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })),
      http.get('/api/games/discover', ({ request }) => {
        expect(new URL(request.url).searchParams.getAll('exclude_game_ids')).toEqual(['g1']);
        return HttpResponse.json({ games: [] });
      }),
    );
    const { qc } = renderHome();
    await waitFor(() =>
      expect(qc.getQueryData(discoverGamesQueryOptions(['g1']).queryKey)).toEqual([]),
    );
    expect(screen.getByText('Catan')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sugerencias' })).not.toBeInTheDocument();
  });

  it('con recientes, "Ver todo" enlaza a /history', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })));
    renderHome();
    const verTodo = await screen.findByRole('link', { name: /Ver todo/i });
    expect(verTodo).toHaveAttribute('href', '/history');
  });

  it('manual con created_at > 30 días → fecha corta (es-ES)', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    server.use(
      http.get('/api/manuals', () =>
        HttpResponse.json({
          manuals: [manual({ id: 'oldie', title: 'Viejo', game_name: 'Viejo', created_at: old })],
        }),
      ),
    );
    renderHome();
    expect(await screen.findByText('Viejo')).toBeInTheDocument();
    expect(
      screen.getByText(/\d{1,2}\s+(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)/i),
    ).toBeInTheDocument();
  });
});
