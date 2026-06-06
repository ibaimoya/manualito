import { delay, http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),

  http.post('/api/ocr', async () => {
    await delay(50);
    return HttpResponse.json({
      lines: [
        { text: 'Bienvenido al manual de prueba.', confidence: 0.94 },
        { text: 'Pagina 1 de demostracion.', confidence: 0.88 },
      ],
    });
  }),

  http.get('/api/games', async ({ request }) => {
    const query = new URL(request.url).searchParams.get('q')?.trim() || 'Catan';
    await delay(20);
    return HttpResponse.json({
      games: [
        {
          id: 'test-game-001',
          name: query,
          bgg_id: 13,
          year_published: 1995,
          manuals_count: 0,
        },
      ],
      attribution: 'Game data provided by BoardGameGeek.',
    });
  }),

  http.post('/api/manuals', async () => {
    await delay(50);
    return HttpResponse.json({
      manual_id: 'test-manual-001',
      game_id: 'test-game-001',
      status: 'indexing',
      visibility: 'private',
      source_type: 'images',
      page_count: 1,
    });
  }),

  http.get('/api/manuals/:manualId', ({ params }) =>
    HttpResponse.json({
      id: params.manualId,
      game_id: 'test-game-001',
      game_name: 'Catan',
      title: 'Catan',
      status: 'active',
      visibility: 'private',
      language: 'spa',
      chunks_indexed: 0,
      created_at: '2026-05-26T10:00:00.000Z',
      indexed_at: '2026-05-26T10:00:10.000Z',
      pages: [],
    }),
  ),

  http.get('/api/manuals/:manualId/processing', async () => {
    await delay(30);
    return HttpResponse.json({
      manual_id: 'test-manual-001',
      status: 'active',
      page_count: 1,
      completed_pages: 1,
      failed_pages: 0,
      pages: [{ page_number: 1, ocr_status: 'completed', text_quality: 'ok' }],
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
