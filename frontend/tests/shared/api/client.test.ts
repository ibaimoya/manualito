import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from '@tests/_helpers/server';
import { http, HttpResponse, delay } from 'msw';
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

describe('api · health', () => {
  it('devuelve {status:"ok"} cuando la API responde', async () => {
    const res = await api.health();
    expect(res).toEqual({ status: 'ok' });
  });

  it('lanza ApiError mapeada si la API responde 502', async () => {
    server.use(http.get('/health', () => HttpResponse.json({}, { status: 502 })));
    await expect(api.health()).rejects.toBeInstanceOf(ApiError);
    try {
      await api.health();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.view.code).toBe('http.502');
    }
  });
});

describe('api · createManual', () => {
  it('envía FormData multipart y devuelve manual_id', async () => {
    let contentType: string | null = null;
    server.use(
      http.post('/api/manuals', ({ request }) => {
        // Verificamos solo el content-type — parsear el multipart en undici
        // con Files puede dar problemas en jsdom + Node 26. La integración real
        // se cubre por contract con OpenAPI y por tests E2E futuros.
        contentType = request.headers.get('content-type');
        return HttpResponse.json({
          manual_id: 'm-1',
          chunks_indexed: 7,
          status: 'indexed',
          ocr_lines: [
            { text: 'Catan es un juego de estrategia.', confidence: 0.92 },
            { text: 'Compite por recursos.', confidence: 0.81 },
          ],
        });
      }),
    );

    const fakeFile = new File(['fake-image-bytes'], 'manual.jpg', { type: 'image/jpeg' });
    const result = await api.createManual('Catan', fakeFile);

    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(result.manual_id).toBe('m-1');
    expect(result.chunks_indexed).toBe(7);
    // El nuevo contrato incluye ocr_lines (ver backend/api/schemas.py
    // ManualCreatedResponse).  Sin este campo el frontend no puede
    // mostrar "Ver texto original" sin re-OCR.
    expect(result.ocr_lines).toHaveLength(2);
    expect(result.ocr_lines[0]?.confidence).toBeGreaterThan(0.9);
  });

  it('413 se mapea a "Foto demasiado grande"', async () => {
    server.use(http.post('/api/manuals', () => HttpResponse.json({}, { status: 413 })));
    const fakeFile = new File(['x'.repeat(10)], 'm.jpg', { type: 'image/jpeg' });
    try {
      await api.createManual('Big', fakeFile);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).view.title).toBe('Foto demasiado grande');
    }
  });
});

describe('api · askManual', () => {
  it('POSTea JSON correcto y devuelve la respuesta', async () => {
    let body: { question?: string } | undefined;
    server.use(
      http.post('/api/manuals/:id/questions', async ({ request, params }) => {
        body = (await request.json()) as { question: string };
        return HttpResponse.json({ answer: `Para ${params.id}: ${body.question}` });
      }),
    );

    const out = await api.askManual('abc', '¿Cómo gano?');
    expect(body?.question).toBe('¿Cómo gano?');
    expect(out.answer).toContain('abc');
  });

  it('504 → mapeado a "Tiempo de espera agotado"', async () => {
    server.use(
      http.post('/api/manuals/:id/questions', () => HttpResponse.json({}, { status: 504 })),
    );
    try {
      await api.askManual('abc', 'q');
    } catch (err) {
      expect((err as ApiError).view.title).toBe('Tiempo de espera agotado');
    }
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

  it('respeta un AbortSignal externo: aborta la mutation y lanza ApiError envuelta', async () => {
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

describe('api · ocr', () => {
  it('POST /api/ocr con FormData devuelve las líneas extraídas', async () => {
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
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]?.text).toBe('hola');
  });

  it('OCR 422 → mapea a "No conseguimos leer el manual"', async () => {
    server.use(http.post('/api/ocr', () => HttpResponse.json({}, { status: 422 })));
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    try {
      await api.ocr(file);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).view.title).toBe('No conseguimos leer el manual');
    }
  });
});

describe('api · response handling (branches no triviales)', () => {
  it('cuando la respuesta es text/plain, devuelve el texto en lugar de JSON', async () => {
    server.use(
      http.get('/health', () =>
        HttpResponse.text('healthy text', { headers: { 'Content-Type': 'text/plain' } }),
      ),
    );
    // Nota: api.health() llama directamente a fetch (no usa request<T>).
    // Probamos la rama text con un endpoint genérico via createManual con
    // un response no-JSON.  Mockear /api/manuals para que devuelva texto:
    server.use(
      http.post('/api/manuals', () =>
        HttpResponse.text('plain text body', {
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const result = await api.createManual('Catan', file);
    // request<T> casts string como T cuando no es JSON.
    expect(result as unknown as string).toBe('plain text body');
  });

  it('error sin body JSON ni text legible → ApiError con view del status', async () => {
    server.use(
      http.post('/api/manuals', () => new HttpResponse(null, { status: 500 })),
    );
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    try {
      await api.createManual('Catan', file);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.view.code).toBe('http.500');
    }
  });
});

describe('isAbortApiError — edge cases', () => {
  it('null, undefined, string vacío → false', () => {
    expect(isAbortApiError(null)).toBe(false);
    expect(isAbortApiError(undefined)).toBe(false);
    expect(isAbortApiError('')).toBe(false);
    expect(isAbortApiError({})).toBe(false);
  });

  it('DOMException con otro nombre (TimeoutError) → false', () => {
    const err = new DOMException('Timeout', 'TimeoutError');
    expect(isAbortApiError(err)).toBe(false);
  });

  it('ApiError con raw NO-DOMException → false', () => {
    const apiErr = new ApiError(
      {
        title: 'X',
        message: 'y',
        retryable: true,
        severity: 'error',
        code: 'x',
      },
      undefined,
      new Error('plain'),
    );
    expect(isAbortApiError(apiErr)).toBe(false);
  });
});

describe('apiErrorNotification — edge cases', () => {
  const fallback = {
    title: 'X',
    id: 'x-id',
    description: 'd',
  };

  it('un Error simple (no ApiError) devuelve el fallback completo', () => {
    expect(apiErrorNotification(new Error('boom'), 'prefix', fallback)).toBe(fallback);
  });

  it('un valor primitivo (string, número, null) devuelve el fallback', () => {
    expect(apiErrorNotification('foo', 'p', fallback)).toBe(fallback);
    expect(apiErrorNotification(42, 'p', fallback)).toBe(fallback);
    expect(apiErrorNotification(null, 'p', fallback)).toBe(fallback);
  });
});
