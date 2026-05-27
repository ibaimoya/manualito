import { http, HttpResponse, delay } from 'msw';

/**
 * Handlers MSW que mimican el backend FastAPI real.
 * Importados en tests vía `setupServer(...handlers)`.
 *
 * Sigue exactamente el shape devuelto por `/openapi.json` (ver
 * backend/api/schemas.py).  Cuando el backend evolucione, regenerar.
 */
export const handlers = [
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),

  http.post('/api/ocr', async () => {
    await delay(50);
    return HttpResponse.json({
      lines: [
        { text: 'Bienvenido al manual de prueba.', confidence: 0.94 },
        { text: 'Página 1 de demostración.', confidence: 0.88 },
      ],
    });
  }),

  http.post('/api/manuals', async () => {
    await delay(50);
    return HttpResponse.json({
      manual_id: 'test-manual-001',
      chunks_indexed: 12,
      status: 'indexed',
      // El gateway devuelve también las líneas OCR (ver
      // backend/api/schemas.py::ManualCreatedResponse).  El MSW mimica
      // el mismo shape; el frontend las persiste con storage.setOcrLines.
      ocr_lines: [
        { text: 'Bienvenido al manual de prueba.', confidence: 0.94 },
        { text: 'Página 1 de demostración.', confidence: 0.88 },
      ],
    });
  }),

  http.post('/api/manuals/:manualId/questions', async ({ request }) => {
    const body = (await request.json()) as { question?: string };
    await delay(30);
    return HttpResponse.json({
      answer: `Respuesta simulada para: "${body.question ?? '...'}".`,
    });
  }),
];

/**
 * Helpers para sobrescribir handlers en tests específicos:
 *
 *   server.use(failManualCreate(502));
 */
export function failManualCreate(status = 500) {
  return http.post('/api/manuals', () =>
    HttpResponse.json({ detail: 'forced error' }, { status }),
  );
}

export function failAskManual(status = 504) {
  return http.post('/api/manuals/:manualId/questions', () =>
    HttpResponse.json({ detail: 'forced error' }, { status }),
  );
}
