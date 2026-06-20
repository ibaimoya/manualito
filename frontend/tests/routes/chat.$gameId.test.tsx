import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { Route as ChatRoute } from '@/routes/_app.chat.$gameId';
import { server } from '@tests/_helpers/server';
import { failSendMessage, SAMPLE_GAME_DETAIL } from '@tests/_helpers/mswHandlers';
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

function gameWithoutManuals() {
  return http.get('/api/games/:gameId', () =>
    HttpResponse.json({ ...SAMPLE_GAME_DETAIL, manuals: [] }),
  );
}

function renderChat(gameId: string, search?: { q?: string; c?: string }) {
  const params = new URLSearchParams();
  if (search?.q) params.set('q', search.q);
  if (search?.c) params.set('c', search.c);
  const queryStr = params.size > 0 ? `?${params.toString()}` : '';
  return renderRoute({
    path: '/chat/$gameId',
    initialEntry: `/chat/${gameId}${queryStr}`,
    component: routeComponent(ChatRoute),
    validateSearch: (s) => ({
      q: typeof s.q === 'string' ? s.q : undefined,
      c: typeof s.c === 'string' ? s.c : undefined,
    }),
    stubs: {
      '/game/$gameId': 'GameScreen',
      '/history': 'HistoryScreen',
      '/manual/$manualId': 'ManualScreen',
    },
  });
}

describe('/chat/$gameId · search schema', () => {
  it('descarta una q por encima de la cota del backend sin tirar la ruta', () => {
    const validateSearch = (
      ChatRoute as unknown as {
        options: { validateSearch: (v: Record<string, unknown>) => Record<string, unknown> };
      }
    ).options.validateSearch;
    const result = validateSearch({ q: 'a'.repeat(4001), c: 'conv-001' });
    expect(result['q']).toBeUndefined();
    expect(result['c']).toBe('conv-001');
    // Una pregunta dentro de la cota pasa intacta.
    expect(validateSearch({ q: 'a'.repeat(4000) })['q']).toHaveLength(4000);
  });
});

describe('/chat/$gameId', () => {
  it('el breadcrumb lleva el juego como tramo navegable y «Chat» como página', async () => {
    renderChat('test-game-001');
    // El detalle del juego (MSW) resuelve el nombre del trail.
    const gameLink = await screen.findByRole('link', { name: 'Catan' });
    expect(gameLink).toHaveAttribute('href', '/game/test-game-001');
    expect((await screen.findAllByText('Chat')).length).toBeGreaterThan(0);
  });

  it('sin manuales: se puede leer la conversación pero no preguntar', async () => {
    server.use(gameWithoutManuals());
    renderChat('test-game-001', { c: 'conv-001' });

    // El historial sigue siendo accesible (solo lectura).
    expect(
      await screen.findByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
    ).toBeInTheDocument();
    // El composer queda deshabilitado con el aviso de fuente no disponible.
    expect(
      await screen.findByText(/Una fuente que usaste ya no está disponible/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Escribe tu pregunta/i)).toBeDisabled();
  });

  it('bienvenida cuando se abre un chat nuevo (sin conversación)', async () => {
    renderChat('test-game-001');
    expect(await screen.findByText(/Pregúntame sobre/)).toBeInTheDocument();
  });

  it('pulsar una pregunta-tarjeta de la bienvenida la envía', async () => {
    renderChat('test-game-001');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '¿Cómo se gana?' }));

    // El click sale de la bienvenida y pinta la respuesta del turno.
    await waitFor(
      () => {
        expect(
          screen.getAllByText('Cada jugador recibe dos asentamientos y dos carreteras.').length,
        ).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it('?c=… reabre la conversación y muestra su historial del servidor', async () => {
    renderChat('test-game-001', { c: 'conv-001' });
    // Mensajes de SAMPLE en el handler MSW por defecto.
    expect(await screen.findByText('¿Cómo se reparten las cartas?')).toBeInTheDocument();
    expect(
      screen.getByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
    ).toBeInTheDocument();
  });

  it('al enviar una pregunta: burbuja optimista + respuesta del backend', async () => {
    let releaseBackend!: () => void;
    const backendReady = new Promise<void>((resolve) => {
      releaseBackend = resolve;
    });
    server.use(
      http.post('/api/conversations/:conversationId/messages', async ({ request }) => {
        const body = (await request.json()) as { content?: string };
        await backendReady;
        return HttpResponse.json({
          conversation: CONVERSATION,
          user_message: {
            id: 'msg-user-optimistic',
            role: 'user',
            status: 'completed',
            content: body.content ?? '',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            id: 'msg-bot-optimistic',
            role: 'assistant',
            status: 'completed',
            content: 'Cada jugador recibe dos asentamientos y dos carreteras.',
            created_at: '2026-05-26T10:06:05.000Z',
            sources: [],
          },
        });
      }),
    );

    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, '¿Y empate?');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Mensaje del usuario aparece inmediato (optimistic UI).
    expect(await screen.findByText('¿Y empate?')).toBeInTheDocument();

    // El backend (MSW) responde el turno completo.
    releaseBackend();
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

  it('mantiene el polling cuando el POST devuelve una respuesta pendiente', async () => {
    let messageReads = 0;
    let sent = false;
    const message = (
      id: string,
      role: 'user' | 'assistant',
      status: 'pending' | 'completed',
      content: string,
    ) => ({
      id,
      role,
      status,
      content,
      created_at: '2026-05-26T10:06:00.000Z',
      sources: [],
    });
    const baseMessages = [
      message('u-base', 'user', 'completed', '¿Cómo se reparten las cartas?'),
      message(
        'b-base',
        'assistant',
        'completed',
        'Cada jugador recibe dos asentamientos y dos carreteras.',
      ),
    ];
    server.use(
      http.get('/api/conversations/:conversationId/messages', () => {
        if (!sent) return HttpResponse.json({ messages: baseMessages });
        messageReads += 1;
        const newTurn =
          messageReads < 2
            ? [
                message('u-async', 'user', 'completed', 'async'),
                message('b-async', 'assistant', 'pending', ''),
              ]
            : [
                message('u-async', 'user', 'completed', 'async'),
                message('b-async', 'assistant', 'completed', 'Respuesta generada por polling.'),
              ];
        return HttpResponse.json({
          messages: [...baseMessages, ...newTurn],
        });
      }),
      http.post('/api/conversations/:conversationId/messages', async ({ request }) => {
        sent = true;
        const body = (await request.json()) as { content?: string };
        return HttpResponse.json({
          conversation: { ...CONVERSATION, has_pending_reply: true },
          user_message: {
            id: 'u-async',
            role: 'user',
            status: 'completed',
            content: body.content ?? '',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            ...message('b-async', 'assistant', 'pending', ''),
            created_at: '2026-05-26T10:06:05.000Z',
          },
        });
      }),
    );

    renderChat('test-game-001', { c: 'conv-001' });
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'async');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    expect(await screen.findByText('async')).toBeInTheDocument();
    expect(await screen.findByRole('status', { name: /Generando respuesta/i })).toBeInTheDocument();
    await waitFor(() => expect(messageReads).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    expect(
      await screen.findByText('Respuesta generada por polling.', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('preguntas vacías o solo whitespace NO se envían', async () => {
    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, '   ');
    const send = screen.getByRole('button', { name: /Enviar pregunta/i });
    // El botón debe estar disabled (draft.trim().length === 0).
    expect(send).toBeDisabled();
  });

  it('si la URL trae ?q=foo, dispara la pregunta automáticamente al montar', async () => {
    renderChat('test-game-001', { q: '¿Cuántos jugadores hay?' });
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
    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
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
    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'reintento');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Falla el envío: el draft vuelve al composer para reintentar.
    await waitFor(() => expect(input).toHaveValue('reintento'), { timeout: 3000 });
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    expect(await screen.findByText('Respuesta al reintento.')).toBeInTheDocument();
    expect(sends).toBe(2);
    expect(creates).toBe(1);
  });

  it('cita páginas: la propia viva enlaza; la borrada y la de comunidad no', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));

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
            // test-manual-001 sigue en el pool (propio); m-borrado ya no; el otro es de comunidad.
            sources: [
              { manual_id: 'test-manual-001', manual_title: 'Reglas base', page: 4, is_own: true },
              { manual_id: 'm-borrado', manual_title: 'Viejo', page: 7, is_own: true },
              { manual_id: 'test-manual-002', manual_title: 'Comunidad', page: 9, is_own: false },
            ],
          },
        }),
      ),
    );
    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'madera');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // La página propia y viva (4) enlaza al visor del manual.
    const own = await screen.findByRole('link', { name: 'Abrir página 4 del manual' });
    expect(own.getAttribute('href')).toContain('/manual/test-manual-001');
    expect(own.getAttribute('href')).toContain('page=4');
    // La fuente propia ya borrada (7) se cita pero NO enlaza.
    expect(screen.getByText('Pág. 7')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /página 7/i })).toBeNull();
    // La de la comunidad (9) tampoco es un enlace.
    expect(screen.getByText('Pág. 9')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /página 9/i })).toBeNull();
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
    renderChat('test-game-001');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'tarda');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // El typing indicator usa <output aria-label="Escribiendo respuesta">.
    expect(
      await screen.findByRole('status', { name: /Escribiendo respuesta/i }),
    ).toBeInTheDocument();
  });

  it('copiar respuesta: escribe el contenido (Markdown) en el portapapeles', async () => {
    server.use(
      http.post('/api/conversations/:conversationId/messages', () =>
        HttpResponse.json({
          conversation: CONVERSATION,
          user_message: {
            id: 'u1',
            role: 'user',
            content: 'q',
            created_at: '2026-05-26T10:06:00.000Z',
            sources: [],
          },
          assistant_message: {
            id: 'b1',
            role: 'assistant',
            content: 'Respuesta **copiable**.',
            created_at: '2026-05-26T10:06:05.000Z',
            sources: [],
          },
        }),
      ),
    );
    renderChat('test-game-001');
    const user = userEvent.setup();
    // El mock va después de setup() para que no lo pise el portapapeles de userEvent.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'q');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // El botón de copiar aparece cuando la respuesta termina de escribirse.
    await screen.findByText(/copiable/i, undefined, { timeout: 3000 });
    const copyButtons = await screen.findAllByRole('button', { name: /Copiar respuesta/i });
    await user.click(copyButtons.at(-1)!);
    expect(writeText).toHaveBeenCalledWith('Respuesta **copiable**.');
  });
});
