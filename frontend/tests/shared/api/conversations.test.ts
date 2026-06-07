import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { conversationsApi } from '@/shared/api/conversations';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  document.cookie = 'manualito_csrf=; path=/; max-age=0';
});
afterAll(() => server.close());

describe('conversationsApi list/create', () => {
  it('lista conversaciones de un juego con paginación opcional', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/games/:gameId/conversations', ({ request }) => {
        const url = new URL(request.url);
        receivedUrl = url.pathname + url.search;
        return HttpResponse.json({ conversations: [] });
      }),
    );

    const res = await conversationsApi.list('g-1', { limit: 10, offset: 20 });

    expect(receivedUrl).toBe('/api/games/g-1/conversations?limit=10&offset=20');
    expect(res.conversations).toEqual([]);
  });

  it('crea una conversación vacía (201) sin cuerpo', async () => {
    let contentLength: string | null = null;
    server.use(
      http.post('/api/games/:gameId/conversations', ({ request }) => {
        contentLength = request.headers.get('content-length');
        return HttpResponse.json(
          {
            id: 'conv-1',
            game_id: 'g-1',
            game_name: 'Catan',
            title: null,
            created_at: '2026-05-26T10:00:00.000Z',
            updated_at: '2026-05-26T10:00:00.000Z',
          },
          { status: 201 },
        );
      }),
    );

    const conv = await conversationsApi.create('g-1');

    expect(conv.id).toBe('conv-1');
    // POST sin body: no debe enviar carga útil.
    expect(contentLength === null || contentLength === '0').toBe(true);
  });
});

describe('conversationsApi messages', () => {
  it('lista mensajes con roles user/assistant', async () => {
    const res = await conversationsApi.listMessages('conv-1');
    expect(res.messages).toHaveLength(2);
    expect(res.messages[0]?.role).toBe('user');
    expect(res.messages[1]?.role).toBe('assistant');
  });

  it('envía un mensaje con content (+ top_k) y devuelve el turno completo', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/conversations/:conversationId/messages', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          conversation: {
            id: 'conv-1',
            game_id: 'g-1',
            game_name: 'Catan',
            title: null,
            created_at: '2026-05-26T10:00:00.000Z',
            updated_at: '2026-05-26T10:06:00.000Z',
          },
          user_message: {
            id: 'm-u',
            role: 'user',
            content: 'hola',
            created_at: '2026-05-26T10:05:00.000Z',
          },
          assistant_message: {
            id: 'm-a',
            role: 'assistant',
            content: 'respuesta',
            created_at: '2026-05-26T10:05:05.000Z',
          },
        });
      }),
    );

    const res = await conversationsApi.sendMessage('conv-1', 'hola', { topK: 7 });

    expect(body).toEqual({ content: 'hola', top_k: 7 });
    expect(res.assistant_message.content).toBe('respuesta');
  });

  it('omite top_k cuando no se pasa', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/conversations/:conversationId/messages', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          conversation: {
            id: 'conv-1',
            game_id: 'g-1',
            game_name: 'Catan',
            title: null,
            created_at: '2026-05-26T10:00:00.000Z',
            updated_at: '2026-05-26T10:06:00.000Z',
          },
          user_message: {
            id: 'm-u',
            role: 'user',
            content: 'q',
            created_at: '2026-05-26T10:05:00.000Z',
          },
          assistant_message: {
            id: 'm-a',
            role: 'assistant',
            content: 'a',
            created_at: '2026-05-26T10:05:05.000Z',
          },
        });
      }),
    );

    await conversationsApi.sendMessage('conv-1', 'q');

    expect(body).toEqual({ content: 'q' });
  });
});

describe('conversationsApi remove', () => {
  it('borra una conversación (204) y adjunta CSRF de la cookie', async () => {
    document.cookie = 'manualito_csrf=conv-csrf; path=/';
    let header: string | null = null;
    server.use(
      http.delete('/api/conversations/:conversationId', ({ request }) => {
        header = request.headers.get('X-CSRF-Token');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(conversationsApi.remove('conv-1')).resolves.toBeUndefined();
    expect(header).toBe('conv-csrf');
  });
});
