import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as GameRoute } from '@/routes/_app.game.$gameId';
import { SAMPLE_GAME_DETAIL } from '@tests/_helpers/mswHandlers';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderHub() {
  return renderRoute({
    path: '/game/$gameId',
    initialEntry: '/game/test-game-001',
    component: routeComponent(GameRoute),
    stubs: {
      '/history': 'Historial stub',
      '/home': 'Home stub',
      '/manual/$manualId': 'Manual stub',
      '/chat/$manualId': 'Chat stub',
      '/conversations/$gameId': 'Conversaciones stub',
      '/capture/source': 'Captura stub',
    },
  });
}

describe('/game/$gameId · cabecera', () => {
  it('muestra nombre, año, metadatos BGG y el chip de IA', async () => {
    renderHub();
    expect((await screen.findAllByRole('heading', { name: 'Catan' })).length).toBeGreaterThan(0);
    // El año se interpola en un nodo aparte: comparamos el texto del párrafo.
    expect(
      screen.getByText((_, element) => element?.textContent === 'Juego de mesa · 1995'),
    ).toBeInTheDocument();
    expect(screen.getByText('3–4 jugadores')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
    expect(screen.getByText('Generado con IA')).toBeInTheDocument();
  });

  it('sin valoración muestra solo el grupo de estrellas (sin CTA de texto)', async () => {
    renderHub();
    expect(await screen.findByRole('group', { name: 'Puntúa este juego' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '5 estrellas — Imprescindible' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Puntúa este juego' })).not.toBeInTheDocument();
  });

  it('al puntuar desde las estrellas guarda y refleja la etiqueta', async () => {
    // PUT estatal: el GET posterior (invalidación) devuelve la valoración.
    let rating: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/games/:gameId/rating', async ({ request }) => {
        const body = (await request.json()) as { score: number; note?: string };
        rating = {
          game_id: 'test-game-001',
          score: body.score,
          note: body.note ?? null,
          created_at: '2026-05-26T12:00:00.000Z',
          updated_at: '2026-05-26T12:00:00.000Z',
        };
        return HttpResponse.json(rating);
      }),
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, my_rating: rating }),
      ),
    );
    renderHub();
    const user = userEvent.setup();
    // Las estrellas de la cabecera abren el diálogo de valoración.
    await user.click(await screen.findByRole('button', { name: '4 estrellas — Muy bueno' }));
    const dialog = await screen.findByRole('dialog', { name: /Qué te ha parecido Catan/ });
    // El guardado exige elegir puntuación dentro del diálogo.
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: '4 estrellas — Muy bueno' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    // Al cerrarse, la cabecera refleja la puntuación en las estrellas.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '4 estrellas — Muy bueno' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});

describe('/game/$gameId · explicación', () => {
  it('renderiza el resumen y los acordeones con sus secciones', async () => {
    renderHub();
    expect(await screen.findByText('Catan va de construir y comerciar.')).toBeInTheDocument();
    // Preparación abierta por defecto; el resto accesibles por trigger.
    expect(screen.getByText('Monta el tablero y reparte piezas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /¿Cómo van los turnos\?/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /¿Cómo se gana\?/ })).toBeInTheDocument();
  });

  it('estado generating: muestra el aviso de "preparando" sin secciones', async () => {
    server.use(
      http.get('/api/games/:gameId/explanation', () =>
        HttpResponse.json({ status: 'generating', sections: null, generated_at: null }),
      ),
    );
    renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    expect(await screen.findByText(/preparando la explicación/i)).toBeInTheDocument();
  });

  it('error 404 (sin indexar): aviso con botón de reintentar', async () => {
    server.use(
      http.get('/api/games/:gameId/explanation', () =>
        HttpResponse.json({ detail: 'sin indexar' }, { status: 404 }),
      ),
    );
    renderHub();
    expect(await screen.findByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });
});

describe('/game/$gameId · fuentes y conversaciones', () => {
  it('el manual propio enlaza al texto extraído; el compartido no', async () => {
    renderHub();
    const region = await screen.findByRole('region', { name: /Manuales/ });
    expect(within(region).getByRole('link', { name: /Ver texto extraído/ })).toHaveAttribute(
      'href',
      '/manual/test-manual-001',
    );
    expect(within(region).getByText(/compartido por la comunidad/)).toBeInTheDocument();
  });

  it('pie con el total agregado de manuales y páginas del pool', async () => {
    renderHub();
    expect(await screen.findByText(/Explicación generada de 2 manuales/)).toBeInTheDocument();
    expect(screen.getByText(/14 páginas/)).toBeInTheDocument();
  });

  it('las conversaciones muestran "Ver todas (N)" hacia la pantalla del juego', async () => {
    renderHub();
    const link = await screen.findByRole('link', { name: /Ver todas \(1\)/ });
    expect(link).toHaveAttribute('href', '/conversations/test-game-001');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    await screen.findByText('Catan va de construir y comerciar.');
    expect(await axe(container)).toHaveNoViolations();
  });
});
