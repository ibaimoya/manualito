import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { Route as ChatRoute } from '@/routes/_app.chat.$manualId';
import { server } from '@tests/_helpers/server';
import { failSendMessage } from '@tests/_helpers/mswHandlers';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const CONVERSATION = {
  id: 'conv-001',
  game_id: 'test-game-001',
  game_name: 'Catan',
  title: 'Dudas de preparación',
  created_at: '2026-05-26T10:00:00.000Z',
  updated_at: '2026-05-26T10:05:00.000Z',
};

function renderChat(manualId: string, search?: { q?: string; c?: string; g?: string }) {
  const params = new URLSearchParams();
  if (search?.q) params.set('q', search.q);
  if (search?.c) params.set('c', search.c);
  if (search?.g) params.set('g', search.g);
  const queryStr = params.size > 0 ? `?${params.toString()}` : '';
  return renderRoute({
    path: '/chat/$manualId',
    initialEntry: `/chat/${manualId}${queryStr}`,
    component: routeComponent(ChatRoute),
    validateSearch: (s) => ({
      q: typeof s.q === 'string' ? s.q : undefined,
      c: typeof s.c === 'string' ? s.c : undefined,
      g: typeof s.g === 'string' ? s.g : undefined,
    }),
    stubs: {
      '/game/$gameId': 'GameScreen',
      '/history': 'HistoryScreen',
    },
  });
}

describe('/chat/$manualId · search schema', () => {
  it('descarta una q por encima de la cota del backend sin tirar la ruta', () => {
    const schema = (
      ChatRoute as unknown as {
        options: { validateSearch: { parse: (v: unknown) => Record<string, unknown> } };
      }
    ).options.validateSearch;
    const result = schema.parse({ q: 'a'.repeat(4001), c: 'conv-001' });
    expect(result['q']).toBeUndefined();
    expect(result['c']).toBe('conv-001');
    // Una pregunta dentro de la cota pasa intacta.
    expect(schema.parse({ q: 'a'.repeat(4000) })['q']).toHaveLength(4000);
  });
});

describe('/chat/$manualId', () => {
  it('el breadcrumb lleva el juego como tramo navegable y «Chat» como página', async () => {
    renderChat('m1');
    // El detalle del manual (MSW) resuelve el juego del trail.
    const gameLink = await screen.findByRole('link', { name: 'Catan' });
    expect(gameLink).toHaveAttribute('href', '/game/test-game-001');
    expect((await screen.findAllByText('Chat')).length).toBeGreaterThan(0);
  });

  it('si el manual no resuelve, el trail conserva al menos Historial', async () => {
    server.use(
      http.get('/api/manuals/:manualId', () =>
        HttpResponse.json({ detail: 'missing' }, { status: 404 }),
      ),
    );
    renderChat('mDesconocido');
    expect(await screen.findByRole('link', { name: 'Historial' })).toBeInTheDocument();
    expect((await screen.findAllByText('Chat')).length).toBeGreaterThan(0);
  });

  it('empty state cuando se abre un chat nuevo (sin conversación)', async () => {
    renderChat('m1');
    expect(await screen.findByText(/Empieza con una pregunta sobre el manual/)).toBeInTheDocument();
  });

  it('?c=… reabre la conversación y muestra su historial del servidor', async () => {
    renderChat('m1', { c: 'conv-001' });
    // Mensajes de SAMPLE en el handler MSW por defecto.
    expect(await screen.findByText('¿Cómo se reparten las cartas?')).toBeInTheDocument();
    expect(
      screen.getByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
    ).toBeInTheDocument();
  });

  it('al enviar una pregunta: burbuja optimista + respuesta del backend', async () => {
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '¿Y empate?');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Mensaje del usuario aparece inmediato (optimistic UI).
    expect(await screen.findByText('¿Y empate?')).toBeInTheDocument();

    // El backend (MSW) responde el turno completo.
    await waitFor(
      () => {
        expect(
          screen.getByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    // La pregunta sigue visible como turno confirmado (no se duplica).
    expect(screen.getAllByText('¿Y empate?')).toHaveLength(1);
  });

  it('preguntas vacías o solo whitespace NO se envían', async () => {
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '   ');
    const send = screen.getByRole('button', { name: /Enviar pregunta/i });
    // El botón debe estar disabled (draft.trim().length === 0).
    expect(send).toBeDisabled();
  });

  it('si la URL trae ?q=foo, dispara la pregunta automáticamente al montar', async () => {
    renderChat('m1', { q: '¿Cuántos jugadores hay?' });
    // El mensaje del usuario aparece inmediato.
    expect(await screen.findByText('¿Cuántos jugadores hay?')).toBeInTheDocument();
    // Y la respuesta llega tras crear conversación + enviar turno.
    await waitFor(
      () => {
        expect(
          screen.getByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('si el LLM falla con 504: toast de error y la pregunta vuelve al composer', async () => {
    server.use(failSendMessage(504));
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, 'fail');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Toast de error: el mapper traduce 504 → "Tiempo de espera agotado".
    await waitFor(
      () => {
        expect(screen.getByText(/Tiempo de espera agotado/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    // El draft se restaura para reintentar sin reescribir.
    expect(input).toHaveValue('fail');
  });

  it('si el primer envío falla, el reintento reutiliza la conversación creada', async () => {
    let creates = 0;
    let sends = 0;
    server.use(
      http.post('/api/games/:gameId/conversations', () => {
        creates += 1;
        return HttpResponse.json(CONVERSATION, { status: 201 });
      }),
      http.post('/api/conversations/:conversationId/messages', () => {
        sends += 1;
        if (sends === 1) return HttpResponse.json({ detail: 'boom' }, { status: 500 });
        return HttpResponse.json({
          conversation: CONVERSATION,
          user_message: {
            id: 'u-retry',
            role: 'user',
            content: 'reintento',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            id: 'b-retry',
            role: 'assistant',
            content: 'Respuesta al reintento.',
            created_at: '2026-05-26T10:06:05.000Z',
            sources: [],
          },
        });
      }),
    );
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, 'reintento');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Falla el envío: el draft vuelve al composer para reintentar.
    await waitFor(() => expect(input).toHaveValue('reintento'), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    expect(await screen.findByText('Respuesta al reintento.')).toBeInTheDocument();
    expect(sends).toBe(2);
    expect(creates).toBe(1);
  });

  it('con ?g=…, volver apunta directo al hub del juego', async () => {
    renderChat('m1', { g: 'test-game-001' });
    const link = await screen.findByRole('link', { name: /Volver al juego/i });
    expect(link).toHaveAttribute('href', '/game/test-game-001');
  });

  it('sin ?g=…, resuelve el juego vía manual y volver apunta al hub', async () => {
    renderChat('m1');
    // El detalle del manual (MSW) trae game_id=test-game-001.
    const link = await screen.findByRole('link', { name: /Volver al juego/i });
    expect(link).toHaveAttribute('href', '/game/test-game-001');
  });

  it('sin ?g= y con el manual inaccesible, cae al historial como último recurso', async () => {
    server.use(
      http.get('/api/manuals/:manualId', () =>
        HttpResponse.json({ detail: 'missing' }, { status: 404 }),
      ),
    );
    renderChat('m1');
    const link = await screen.findByRole('link', { name: /Volver al historial/i });
    expect(link).toHaveAttribute('href', '/history');
  });

  it('badge "Listo" presente en el header del chat', async () => {
    renderChat('m1');
    expect(await screen.findByText('Listo')).toBeInTheDocument();
  });

  it('muestra las páginas citadas (sources) bajo la respuesta del bot, deduplicadas', async () => {
    server.use(
      http.post('/api/conversations/:conversationId/messages', () =>
        HttpResponse.json({
          conversation: CONVERSATION,
          user_message: {
            id: 'u1',
            role: 'user',
            content: 'madera',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            id: 'b1',
            role: 'assistant',
            content: 'La madera la dan los bosques.',
            created_at: '2026-05-26T10:06:05.000Z',
            sources: [
              { manual_id: 'm1', manual_title: 'Catan', page: 4 },
              { manual_id: 'm1', manual_title: 'Catan', page: 4 },
              { manual_id: 'm1', manual_title: 'Catan', page: 7 },
            ],
          },
        }),
      ),
    );
    renderChat('m1');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Escribe tu pregunta/i), 'madera');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));
    expect(await screen.findByText('Pág. 4')).toBeInTheDocument();
    expect(screen.getByText('Pág. 7')).toBeInTheDocument();
    // La página 4 viene dos veces pero se muestra un único chip.
    expect(screen.getAllByText('Pág. 4')).toHaveLength(1);
  });

  it('typing indicator mientras la mutation está en vuelo', async () => {
    // Forzamos un delay alto para ver el indicator.
    server.use(
      http.post('/api/conversations/:conversationId/messages', async () => {
        await delay(500);
        return HttpResponse.json({
          conversation: CONVERSATION,
          user_message: {
            id: 'u1',
            role: 'user',
            content: 'tarda',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            id: 'b1',
            role: 'assistant',
            content: 'tardío',
            created_at: '2026-05-26T10:06:05.000Z',
            sources: [],
          },
        });
      }),
    );
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, 'tarda');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // El typing indicator usa <output aria-label="Escribiendo respuesta">.
    expect(
      await screen.findByRole('status', { name: /Escribiendo respuesta/i }),
    ).toBeInTheDocument();
  });
});
