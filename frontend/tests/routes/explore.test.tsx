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
    stubs: { '/game/$gameId': 'GameHubScreen', '/capture/source': 'UploadScreen' },
  });
}

describe('/explore', () => {
  it('abre los juegos de la comunidad sin pasar por la subida', async () => {
    renderExplore();
    await userEvent.click(await screen.findByRole('link', { name: 'Ver Carcassonne' }));
    expect(await screen.findByText('GameHubScreen')).toBeInTheDocument();
  });

  it('invita a subir el primer manual cuando no hay juegos disponibles', async () => {
    server.use(
      http.get('/api/games/discover', () => HttpResponse.json({ games: [], attribution: '' })),
    );
    renderExplore();
    expect(await screen.findByText('Aquí empieza la próxima partida')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subir un manual' })).toHaveAttribute(
      'href',
      '/capture/source',
    );
  });

  it('permite reintentar un error sin anunciar un catálogo vacío', async () => {
    server.use(http.get('/api/games/discover', () => new HttpResponse(null, { status: 503 })));
    renderExplore();
    expect(await screen.findByRole('alert')).toHaveTextContent('No hemos podido cargar los juegos');
    expect(screen.queryByText('Aquí empieza la próxima partida')).not.toBeInTheDocument();
    server.resetHandlers();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Ver Carcassonne' })).toBeInTheDocument();
  });

  it('barajar pide otra selección al servidor', async () => {
    renderExplore();
    const shuffle = await screen.findByRole('button', { name: 'Ver otras sugerencias' });
    server.use(
      http.get('/api/games/discover', () =>
        HttpResponse.json({ games: [searchResult('g2', 'Dominion', 1)], attribution: '' }),
      ),
    );
    await userEvent.click(shuffle);
    expect(await screen.findByRole('link', { name: 'Ver Dominion' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver Carcassonne' })).not.toBeInTheDocument();
  });

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
