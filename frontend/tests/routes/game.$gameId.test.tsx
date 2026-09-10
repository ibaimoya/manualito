import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as GameRoute } from '@/routes/_app.game.$gameId';
import { gameDetailKey } from '@/features/games/use-games';
import { SAMPLE_GAME_DETAIL } from '@tests/_helpers/mswHandlers';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';
import i18n from '@/app/i18n';

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
      '/chat/$gameId': 'Chat stub',
      '/conversations/$gameId': 'Conversaciones stub',
      '/capture/source': 'Captura stub',
    },
  });
}

describe('/game/$gameId · preguntas sugeridas', () => {
  it('reinicia el borrador al navegar a otro juego que ya está en caché', async () => {
    const { qc, router } = renderHub();
    const input = await screen.findByRole('textbox', { name: /Escribe tu pregunta/i });
    await userEvent.setup().type(input, 'Pregunta de Catan');
    qc.setQueryData(gameDetailKey('game-wingspan'), {
      ...SAMPLE_GAME_DETAIL,
      id: 'game-wingspan',
      name: 'Wingspan',
    });

    await act(() => router.navigate({ to: '/game/$gameId', params: { gameId: 'game-wingspan' } }));

    expect(
      (await screen.findAllByRole('heading', { level: 1, name: 'Wingspan' })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /Escribe tu pregunta/i })).toHaveValue('');
  });

  it.each(['es', 'en'])(
    'no duplica las preguntas en %s, ni en copias ocultas',
    async (language) => {
      await act(() => i18n.changeLanguage(language));
      renderHub();
      const carousel = await screen.findByRole('group', {
        name: i18n.t('game:composer.aria.suggestedQuestions'),
      });
      const questions = within(carousel)
        .getAllByRole('button', { hidden: true })
        .filter((button) => button.textContent?.endsWith('?'));
      expect(questions).toHaveLength(14);
      expect(new Set(questions.map((button) => button.textContent)).size).toBe(questions.length);
    },
  );

  it('abre el chat al elegir una pregunta', async () => {
    renderHub();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '¿Quién empieza?' }));
    expect(await screen.findByText('Chat stub')).toBeInTheDocument();
  });

  it('no ofrece preguntas si no hay un manual disponible', async () => {
    server.use(
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, manuals: [] }),
      ),
    );
    renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    expect(screen.queryByRole('group', { name: 'Preguntas sugeridas' })).not.toBeInTheDocument();
  });
});

describe('/game/$gameId · cabecera', () => {
  it('muestra nombre y año, y sitúa la ayuda de IA junto al resumen', async () => {
    renderHub();
    expect((await screen.findAllByRole('heading', { name: 'Catan' })).length).toBeGreaterThan(0);
    // El año se interpola en un nodo aparte: comparamos el texto del párrafo.
    expect(
      screen.getByText((_, element) => element?.textContent === 'Juego de mesa · 1995'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Generado con IA')).not.toBeInTheDocument();
    const summaryLabel = await screen.findByText('Resumen rápido');
    const aiHelp = within(summaryLabel.parentElement!).getByRole('button', {
      name: 'Generado con IA',
    });
    const user = userEvent.setup();
    await user.hover(aiHelp);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^Generado con IA$/);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('sin valoración muestra solo el grupo de estrellas (sin CTA de texto)', async () => {
    renderHub();
    expect(await screen.findByRole('group', { name: 'Puntúa este juego' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 estrellas — Es una locura' })).toBeInTheDocument();
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
    const { qc } = renderHub();
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
      expect(qc.getQueryState(gameDetailKey('test-game-001'))?.status).toBe('error');
    });
    expect(screen.getAllByRole('heading', { name: 'Catan' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/No hemos encontrado este juego/)).not.toBeInTheDocument();
  });
});

describe('/game/$gameId, recuperación', () => {
  it.each([
    { status: 404, title: 'No hemos encontrado este juego', retry: false },
    { status: 503, title: 'El juego no ha cargado', retry: true },
    { status: null, title: 'No podemos cargar este juego', retry: true },
  ])(
    'distingue el fallo $status y permite volver a la biblioteca',
    async ({ status, title, retry }) => {
      server.use(
        http.get('/api/games/:gameId', () =>
          status === null ? HttpResponse.error() : HttpResponse.json({}, { status }),
        ),
      );
      renderHub();
      await screen.findByRole('heading', { name: title });
      expect(Boolean(screen.queryByRole('button', { name: 'Reintentar' }))).toBe(retry);
      await userEvent.setup().click(screen.getByRole('link', { name: 'Ir a mi biblioteca' }));
      expect(await screen.findByText('Historial stub')).toBeInTheDocument();
    },
  );

  it('mantiene el error durante el reintento y recupera la ficha con una sola petición nueva', async () => {
    const user = userEvent.setup();
    let requests = 0;
    // La respuesta de red controlada permite comprobar el estado pendiente sin esperas arbitrarias.
    const response = Promise.withResolvers<void>();
    server.use(
      http.get('/api/games/:gameId', async () => {
        requests += 1;
        if (requests === 1) return HttpResponse.json({}, { status: 503 });
        await response.promise;
        return HttpResponse.json(SAMPLE_GAME_DETAIL);
      }),
    );
    renderHub();
    const heading = await screen.findByRole('heading', { name: 'El juego no ha cargado' });
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    await user.click(retry);
    await user.click(retry);
    await waitFor(() => expect(requests).toBe(2));
    expect(retry).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'El juego no ha cargado' })).toBe(heading);
    await act(async () => response.resolve());
    expect((await screen.findAllByRole('heading', { name: 'Catan' })).length).toBeGreaterThan(0);
    expect(requests).toBe(2);
    expect(
      screen.queryByRole('heading', { name: 'El juego no ha cargado' }),
    ).not.toBeInTheDocument();
  });
});

describe('/game/$gameId · explicación', () => {
  it('cacheado (ready): resumen y acordeones al instante, sin teclear', async () => {
    renderHub();
    // ready (revisita/cache) ⇒ sin animación: el resumen está en cuanto cargan los datos.
    // Si re-animara, este getByText síncrono fallaría (texto a medias).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Preparación/ })).toBeEnabled();
    });
    expect(screen.getByText('Catan va de construir y comerciar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /¿Cómo van los turnos\?/ })).toBeInTheDocument();
    // Las secciones arrancan cerradas: solo los triggers, sin su contenido.
    expect(screen.queryByText('Monta el tablero y reparte piezas.')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Preparación/ }));
    expect(await screen.findByText('Monta el tablero y reparte piezas.')).toBeInTheDocument();
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

  it('generating con resumen ya recibido: muestra el texto sin repetir tecleo', async () => {
    server.use(
      http.get('/api/games/:gameId/explanation', () =>
        HttpResponse.json({
          status: 'generating',
          sections: { summary: { answer: 'Catan va de construir y comerciar.', sources: [] } },
          generated_at: null,
        }),
      ),
    );
    renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    expect(await screen.findByText('Catan va de construir y comerciar.')).toBeInTheDocument();
    // Lo que aún se está generando sigue bloqueado.
    expect(screen.getByRole('button', { name: /Preparación/ })).toBeDisabled();
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

describe('/game/$gameId · seguir', () => {
  it('conserva el foco y evita duplicar la petición mientras espera al servidor', async () => {
    const response = Promise.withResolvers<HttpResponse<null>>();
    let requests = 0;
    let following = false;
    server.use(
      http.post('/api/games/:gameId/follow', async () => {
        requests++;
        const result = await response.promise;
        following = true;
        return result;
      }),
      http.delete('/api/games/:gameId/follow', () => {
        following = false;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, is_following: following }),
      ),
    );
    renderHub();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Seguir este juego' });
    await user.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(requests).toBe(1);

    response.resolve(new HttpResponse(null, { status: 204 }));
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'false'));
    expect(button).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
    expect(following).toBe(false);
  });

  it('si falla, restaura el estado anterior, avisa y permite reintentar', async () => {
    server.use(
      http.post('/api/games/:gameId/follow', () => new HttpResponse(null, { status: 500 })),
    );
    renderHub();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Seguir este juego' }));
    expect(
      await screen.findByText('No se ha guardado el cambio. Inténtalo de nuevo.'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Seguir este juego' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('aria-disabled', 'false');

    let following = false;
    server.use(
      http.post('/api/games/:gameId/follow', () => {
        following = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, is_following: following }),
      ),
    );
    await user.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-busy', 'false');
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('seguir el juego: «Seguir» → «Siguiendo» y lanza el POST', async () => {
    let following = false;
    server.use(
      http.post('/api/games/:gameId/follow', () => {
        following = true;
        return new HttpResponse(null, { status: 204 });
      }),
      // Estatal: tras seguir, el refetch del detalle ya devuelve is_following=true.
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, is_following: following }),
      ),
    );
    renderHub();
    const user = userEvent.setup();
    const follow = await screen.findByRole('button', { name: 'Seguir este juego' });
    expect(follow).toHaveAttribute('aria-pressed', 'false');
    await user.click(follow);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Dejar de seguir este juego' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(following).toBe(true);
  });
});

describe('/game/$gameId · fuentes y conversaciones', () => {
  it('avisa si falla el borrado de una conversación y conserva la fila', async () => {
    server.use(
      http.delete(
        '/api/conversations/:conversationId',
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    renderHub();
    const user = userEvent.setup();
    const remove = await screen.findByRole('button', { name: /Borrar conversación/ });
    await user.click(remove);
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(await screen.findByText('No hemos podido borrarla')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Borrar conversación/ })).toBeEnabled();
  });

  it('el manual propio enlaza al texto extraído; el compartido no', async () => {
    renderHub();
    const region = await screen.findByRole('region', { name: /Manuales/ });
    expect(within(region).getByRole('link', { name: /Ver texto extraído/ })).toHaveAttribute(
      'href',
      '/manual/test-manual-001',
    );
    const shared = within(region).getByRole('button', { name: /Compartido por la comunidad/ });
    expect(shared.closest('a')).toBeNull();
    await userEvent.setup().hover(shared);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Compartido por la comunidad/);
  });

  it('pie con el total agregado de manuales y páginas del pool', async () => {
    renderHub();
    expect(await screen.findByText(/Explicación generada de 2 manuales/)).toBeInTheDocument();
    expect(screen.getByText(/14 páginas/)).toBeInTheDocument();
  });

  it('un manual del pool con páginas duplicadas avisa en su tarjeta', async () => {
    server.use(
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({
          ...SAMPLE_GAME_DETAIL,
          manuals: [
            { ...SAMPLE_GAME_DETAIL.manuals[0], duplicate_page_count: 1 },
            SAMPLE_GAME_DETAIL.manuals[1],
          ],
        }),
      ),
    );
    renderHub();
    const region = await screen.findByRole('region', { name: /Manuales/ });
    const ownLink = within(region).getByRole('link', { name: /Ver texto extraído/ });
    expect(ownLink.querySelector('button')).toBeNull();
    expect(within(ownLink).getByText('1')).toBeInTheDocument();
    await userEvent.setup().hover(ownLink);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Una página es idéntica/);
  });

  it('las conversaciones muestran "Ver todas (N)" hacia la pantalla del juego', async () => {
    renderHub();
    const link = await screen.findByRole('link', { name: /Ver todas \(1\)/ });
    expect(link).toHaveAttribute('href', '/conversations/test-game-001');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderHub();
    await screen.findAllByRole('heading', { name: 'Catan' });
    expect(
      await screen.findByText('Catan va de construir y comerciar.', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
