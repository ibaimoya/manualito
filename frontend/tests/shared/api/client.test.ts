import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { ApiError, api, apiErrorNotification, isAbortApiError } from '@/shared/api/client';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api error helpers', () => {
  const apiError = new ApiError(
    {
      title: 'Foto demasiado grande',
      message: 'La foto pesa mas de 20 MB.',
      retryable: true,
      severity: 'warning',
      code: 'http.413',
    },
    413,
    null,
  );

  it('detectan cancelaciones directas y envueltas en ApiError', () => {
    const abortError = new DOMException('Aborted', 'AbortError');

    expect(isAbortApiError(abortError)).toBe(true);
    expect(isAbortApiError(new ApiError(apiError.view, undefined, abortError))).toBe(true);
    expect(isAbortApiError(new Error('network'))).toBe(false);
  });

  it('construyen notificaciones estables para ApiError y fallback', () => {
    const fallback = {
      title: 'Error inesperado',
      id: 'mutation-error-unknown',
      description: 'Vuelve a intentarlo en un momento.',
    };

    expect(apiErrorNotification(apiError, 'mutation-error', fallback)).toEqual({
      title: 'Foto demasiado grande',
      id: 'mutation-error-http.413',
      description: 'La foto pesa mas de 20 MB.',
    });
    expect(apiErrorNotification(new Error('boom'), 'mutation-error', fallback)).toBe(fallback);
  });
});

describe('api health', () => {
  it('devuelve status ok cuando la API responde', async () => {
    const res = await api.health();
    expect(res).toEqual({ status: 'ok' });
  });

  it('lanza ApiError mapeada si la API responde 502', async () => {
    server.use(http.get('/health', () => HttpResponse.json({}, { status: 502 })));
    await expect(api.health()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('api createManual', () => {
  it('envia imagenes en FormData y devuelve el contrato 202', async () => {
    let body = '';
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({
          manual_id: 'm-1',
          game_id: 'g-1',
          status: 'indexing',
          visibility: 'private',
          source_type: 'images',
          page_count: 2,
        });
      }),
    );

    const result = await api.createManual({
      title: 'Catan',
      gameId: 'g-1',
      images: [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ],
    });

    expect(body).toContain('title');
    expect(body).toContain('Catan');
    expect(body).toContain('game_id');
    expect(body).toContain('g-1');
    expect(body).toContain('images');
    expect(body.match(/name="images"/g)).toHaveLength(2);
    expect(result).toMatchObject({
      manual_id: 'm-1',
      status: 'indexing',
      source_type: 'images',
      page_count: 2,
    });
  });

  it('envia PDF como campo singular', async () => {
    let body = '';
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({
          manual_id: 'm-pdf',
          game_id: 'g-1',
          status: 'indexing',
          visibility: 'private',
          source_type: 'pdf',
          page_count: 3,
        });
      }),
    );

    const result = await api.createManual({
      title: 'Catan',
      gameId: 'g-1',
      pdf: new File(['pdf'], 'manual.pdf', { type: 'application/pdf' }),
    });

    expect(body).toContain('pdf');
    expect(body).toContain('game_id');
    expect(body).toContain('g-1');
    expect(body.match(/name="pdf"/g)).toHaveLength(1);
    expect(result.source_type).toBe('pdf');
  });

  it('413 se mapea a Foto demasiado grande', async () => {
    server.use(http.post('/api/manuals', () => HttpResponse.json({}, { status: 413 })));

    await expect(
      api.createManual({
        title: 'Big',
        gameId: 'g-1',
        images: [new File(['x'], 'm.jpg', { type: 'image/jpeg' })],
      }),
    ).rejects.toMatchObject({ view: { title: 'Foto demasiado grande' } });
  });
});

describe('api searchGames', () => {
  it('consulta el typeahead de juegos con query encodeada', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/games', ({ request }) => {
        receivedUrl = new URL(request.url).pathname + new URL(request.url).search;
        return HttpResponse.json({
          games: [
            {
              id: 'g-1',
              name: 'Catan',
              bgg_id: 13,
              year_published: 1995,
              manuals_count: 0,
            },
          ],
          attribution: 'Game data provided by BoardGameGeek.',
        });
      }),
    );

    const result = await api.searchGames('Catán');

    expect(receivedUrl).toBe('/api/games?q=Cat%C3%A1n&limit=5');
    expect(result.games[0]?.id).toBe('g-1');
  });
});

describe('api getManual', () => {
  it('lee paginas y lineas OCR del detalle de manual', async () => {
    server.use(
      http.get('/api/manuals/:id', ({ params }) =>
        HttpResponse.json({
          id: params.id,
          game_id: 'g-1',
          game_name: 'Catan',
          title: 'Catan',
          status: 'active',
          visibility: 'private',
          language: 'spa',
          chunks_indexed: 2,
          created_at: '2026-05-26T10:00:00.000Z',
          indexed_at: '2026-05-26T10:00:10.000Z',
          pages: [
            {
              page_number: 1,
              ocr_status: 'completed',
              text_source: 'ocr',
              text_quality: 'ok',
              ocr_confidence_mean: 0.88,
              ocr_lines: [{ text: 'Reglas', confidence: 0.88 }],
            },
          ],
        }),
      ),
    );

    const result = await api.getManual('m-1');

    expect(result.pages[0]?.ocr_lines[0]?.text).toBe('Reglas');
  });
});

describe('api getManualProcessing', () => {
  it('lee progreso ligero del manual', async () => {
    server.use(
      http.get('/api/manuals/:id/processing', ({ params }) =>
        HttpResponse.json({
          manual_id: params.id,
          status: 'indexing',
          page_count: 2,
          completed_pages: 1,
          failed_pages: 0,
          pages: [
            { page_number: 1, ocr_status: 'completed', text_quality: 'ok' },
            { page_number: 2, ocr_status: 'pending', text_quality: null },
          ],
        }),
      ),
    );

    const result = await api.getManualProcessing('m-1');

    expect(result.completed_pages).toBe(1);
    expect(result.pages).toHaveLength(2);
  });
});

describe('api askManual', () => {
  it('POSTea JSON correcto y devuelve la respuesta', async () => {
    let body: { question?: string } | undefined;
    server.use(
      http.post('/api/manuals/:id/questions', async ({ request, params }) => {
        body = (await request.json()) as { question: string };
        return HttpResponse.json({ answer: `Para ${params.id}: ${body.question}` });
      }),
    );

    const out = await api.askManual('abc', 'Como gano?');
    expect(body?.question).toBe('Como gano?');
    expect(out.answer).toContain('abc');
  });

  it('encodea correctamente IDs con caracteres especiales', async () => {
    let receivedUrl: string | undefined;
    server.use(
      http.post('/api/manuals/:id/questions', ({ request }) => {
        receivedUrl = new URL(request.url).pathname;
        return HttpResponse.json({ answer: 'ok' });
      }),
    );
    await api.askManual('a/b c', 'q');
    expect(receivedUrl).toBe('/api/manuals/a%2Fb%20c/questions');
  });

  it('respeta un AbortSignal externo', async () => {
    server.use(
      http.post('/api/manuals/:id/questions', async () => {
        await delay(500);
        return HttpResponse.json({ answer: 'late' });
      }),
    );
    const ctrl = new AbortController();
    const promise = api.askManual('m1', 'q', ctrl.signal);
    setTimeout(() => ctrl.abort(), 20);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
  });
});

describe('api ocr', () => {
  it('POST /api/ocr con FormData devuelve las lineas extraidas', async () => {
    let received: string | null = null;
    server.use(
      http.post('/api/ocr', ({ request }) => {
        received = request.headers.get('content-type');
        return HttpResponse.json({
          lines: [{ text: 'hola', confidence: 0.9 }],
        });
      }),
    );
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const res = await api.ocr(file);
    expect(received).toMatch(/^multipart\/form-data/);
    expect(res.lines[0]?.text).toBe('hola');
  });
});

describe('api response handling', () => {
  it('cuando la respuesta es text/plain, devuelve texto', async () => {
    server.use(
      http.post('/api/manuals', () =>
        HttpResponse.text('plain text body', {
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );
    const result = await api.createManual({
      title: 'Catan',
      gameId: 'g-1',
      images: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
    });
    expect(result as unknown as string).toBe('plain text body');
  });

  it('error sin body JSON lanza ApiError con view del status', async () => {
    server.use(http.post('/api/manuals', () => new HttpResponse(null, { status: 500 })));
    await expect(
      api.createManual({
        title: 'Catan',
        gameId: 'g-1',
        images: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

describe('isAbortApiError edge cases', () => {
  it('valores no abort devuelven false', () => {
    expect(isAbortApiError(null)).toBe(false);
    expect(isAbortApiError(undefined)).toBe(false);
    expect(isAbortApiError('')).toBe(false);
    expect(isAbortApiError({})).toBe(false);
    expect(isAbortApiError(new DOMException('Timeout', 'TimeoutError'))).toBe(false);
  });
});
