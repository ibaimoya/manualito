import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as GameRoute } from '@/routes/_app.game.$gameId';
import { storage } from '@/shared/lib/storage';
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
      screen.getByRole('button', { name: '5 estrellas — Es una locura' }),
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
    // La estrella pulsada en la cabecera abre el diálogo con esa puntuación
    // precargada (sin tocar el servidor hasta guardar).
    await user.click(await screen.findByRole('button', { name: '4 estrellas — Es muy bueno' }));
    const dialog = await screen.findByRole('dialog', { name: /Qué te ha parecido Catan/ });
    expect(
      within(dialog).getByRole('button', { name: '4 estrellas — Es muy bueno' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    // Al cerrarse, la cabecera refleja la puntuación en las estrellas.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '4 estrellas — Es muy bueno' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });
});

describe('/game/$gameId · refetch fallido con cache', () => {
  it('no apila el error a pantalla completa sobre el hub ya cargado', async () => {
    renderHub();
    const user = userEvent.setup();
    await screen.findAllByRole('heading', { name: 'Catan' });

    // El PUT funciona pero el refetch de la invalidación falla: la query
    // queda en error conservando la cache → debe verse el hub, no el error.
    server.use(
      http.put('/api/games/:gameId/rating', () =>
        HttpResponse.json({
          game_id: 'test-game-001',
          score: 4,
          note: null,
          created_at: '2026-05-26T12:00:00.000Z',
          updated_at: '2026-05-26T12:00:00.000Z',
        }),
      ),
      http.get('/api/games/:gameId', () => HttpResponse.json({ detail: 'caído' }, { status: 500 })),
    );
    await user.click(await screen.findByRole('button', { name: '4 estrellas — Es muy bueno' }));
    const dialog = await screen.findByRole('dialog', { name: /Qué te ha parecido Catan/ });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('heading', { name: 'Catan' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No hemos encontrado este juego/)).not.toBeInTheDocument();
  });
});

describe('/game/$gameId · explicación', () => {
  it('renderiza el resumen y los acordeones cerrados, que se abren al pulsar', async () => {
    renderHub();
    // El resumen se revela letra a letra (animación del chat): espera al texto completo.
    await waitFor(
      () => expect(screen.getByText('Catan va de construir y comerciar.')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // Las secciones arrancan cerradas: solo los triggers, sin su contenido.
    expect(screen.getByRole('button', { name: /¿Cómo van los turnos\?/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /¿Cómo se gana\?/ })).toBeInTheDocument();
    expect(screen.queryByText('Monta el tablero y reparte piezas.')).not.toBeInTheDocument();
    // Al abrir «Preparación», su contenido aparece (también animado).
    await userEvent.setup().click(screen.getByRole('button', { name: /Preparación/ }));
    await waitFor(
      () => expect(screen.getByText('Monta el tablero y reparte piezas.')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('estado generating: esqueleto de carga con los acordeones bloqueados', async () => {
    server.use(
      http.get('/api/games/:gameId/explanation', () =>
        HttpResponse.json({ status: 'generating', sections: null, generated_at: null }),
      ),
    );
    renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    expect(
      await screen.findByRole('region', { name: /Preparando la explicación/i }),
    ).toBeInTheDocument();
    // Misma estructura final pero sin poder desplegar mientras se genera.
    expect(screen.getByRole('button', { name: /Preparación/ })).toBeDisabled();
  });

  it('no re-anima el resumen ya visto antes: aparece entero sin teclear', async () => {
    // Simula una visita anterior: el resumen de este juego ya se tecleó una vez.
    storage.markExplanationAnimated('test-game-001:summary');
    renderHub();
    // Cuando la explicación está lista (acordeón ya habilitado), el resumen está
    // completo en el mismo render: sin la animación letra a letra (que lo dejaría
    // a medias). Si re-animara, este getByText síncrono no encontraría el texto.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Preparación/ })).toBeEnabled(),
    );
    expect(screen.getByText('Catan va de construir y comerciar.')).toBeInTheDocument();
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
    expect(within(region).getByText(/Compartido por la comunidad/)).toBeInTheDocument();
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
    await waitFor(
      () => expect(screen.getByText('Catan va de construir y comerciar.')).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
