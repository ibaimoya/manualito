import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { ApiError, api } from './client';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
        // con Files puede dar problemas en jsdom + Node 24. La integración real
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
});
