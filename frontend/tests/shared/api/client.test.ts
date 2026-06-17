import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { ApiError, api, apiErrorNotification, isAbortApiError } from '@/shared/api/client';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  document.cookie = 'manualito_csrf=; path=/; max-age=0';
});
afterAll(() => server.close());

describe('api error helpers', () => {
  const apiError = new ApiError(
    {
      title: 'Foto demasiado grande',
      message: 'La foto pesa más de 30 MB.',
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
      description: 'La foto pesa más de 30 MB.',
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
  it('envía imágenes en FormData y devuelve el contrato 202', async () => {
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
  it('lee páginas y líneas OCR del detalle de manual', async () => {
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
              dedup_status: 'reused',
              image_available: true,
              image_width: 800,
              image_height: 1200,
              ocr_confidence_mean: 0.88,
              ocr_lines: [{ text: 'Reglas', confidence: 0.88 }],
            },
          ],
        }),
      ),
    );

    const result = await api.getManual('m-1');

    expect(result.pages[0]?.ocr_lines[0]?.text).toBe('Reglas');
    expect(result.pages[0]?.dedup_status).toBe('reused');
    expect(api.manualPageImageUrl('m-1', 1)).toBe('/api/manuals/m-1/pages/1/image');
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
            { page_number: 1, ocr_status: 'completed', text_quality: 'ok', dedup_status: 'reused' },
            { page_number: 2, ocr_status: 'pending', text_quality: null, dedup_status: 'none' },
          ],
        }),
      ),
    );

    const result = await api.getManualProcessing('m-1');

    expect(result.completed_pages).toBe(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.dedup_status).toBe('reused');
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

describe('api listManuals', () => {
  it('lista manuales con paginación opcional', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/manuals', ({ request }) => {
        const url = new URL(request.url);
        receivedUrl = url.pathname + url.search;
        return HttpResponse.json({ manuals: [] });
      }),
    );

    const res = await api.listManuals({ limit: 25, offset: 50 });

    expect(receivedUrl).toBe('/api/manuals?limit=25&offset=50');
    expect(res.manuals).toEqual([]);
  });

  it('sin parámetros no añade query string', async () => {
    let receivedUrl = '';
    server.use(
      http.get('/api/manuals', ({ request }) => {
        const url = new URL(request.url);
        receivedUrl = url.pathname + url.search;
        return HttpResponse.json({ manuals: [] });
      }),
    );

    await api.listManuals();

    expect(receivedUrl).toBe('/api/manuals');
  });
});

describe('api deleteManual', () => {
  it('resuelve sin cuerpo ante un 204', async () => {
    await expect(api.deleteManual('m-1')).resolves.toBeUndefined();
  });
});

describe('CSRF injection en el núcleo de transporte', () => {
  it('añade X-CSRF-Token en mutaciones cuando hay cookie legible', async () => {
    document.cookie = 'manualito_csrf=abc123; path=/';
    let header: string | null = null;
    server.use(
      http.post('/api/manuals/:manualId/reprocess', ({ request }) => {
        header = request.headers.get('X-CSRF-Token');
        return HttpResponse.json({
          manual_id: 'm-1',
          status: 'indexing',
          page_count: 1,
          completed_pages: 0,
          failed_pages: 0,
          pages: [],
        });
      }),
    );

    await api.reprocessManual('m-1');

    expect(header).toBe('abc123');
  });

  it('no añade X-CSRF-Token en peticiones GET', async () => {
    document.cookie = 'manualito_csrf=abc123; path=/';
    let header: string | null = 'unset';
    server.use(
      http.get('/api/manuals', ({ request }) => {
        header = request.headers.get('X-CSRF-Token');
        return HttpResponse.json({ manuals: [] });
      }),
    );

    await api.listManuals();

    expect(header).toBeNull();
  });
});
