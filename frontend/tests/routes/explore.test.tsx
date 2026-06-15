import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { Route as ExploreRoute } from '@/routes/_app.explore';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function searchResult(id: string, name: string, manualsCount: number) {
  return { id, name, bgg_id: 13, year_published: 1995, manuals_count: manualsCount };
}

function renderExplore() {
  return renderRoute({
    path: '/explore',
    initialEntry: '/explore',
    component: routeComponent(ExploreRoute),
    stubs: { '/game/$gameId': 'GameHubScreen' },
  });
}

describe('/explore', () => {
  it('al elegir un juego del buscador navega a su hub', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json({
          games: [searchResult('g1', 'Catan', 3)],
          attribution: 'Powered by BoardGameGeek.',
        }),
      ),
    );
    renderExplore();
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), 'cat');
    await user.click(await screen.findByRole('button', { name: /Catan/i }));
    expect(await screen.findByText('GameHubScreen')).toBeInTheDocument();
  });

  it('sin coincidencias no ofrece crear (eso es solo para subir)', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json({ games: [], attribution: 'Powered by BoardGameGeek.' }),
      ),
    );
    renderExplore();
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), 'zzzqqq');
    expect(await screen.findByText(/No encontramos ese juego/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Crear/i })).not.toBeInTheDocument();
  });
});
