import { delay, http, HttpResponse } from 'msw';

/* ============================================================
   Fixtures compartidas (shape idéntica al backend)
   ============================================================ */

const SAMPLE_USER = {
  id: 'user-001',
  email: 'marta@example.com',
  username: 'marta',
  role: 'user',
  status: 'active',
  created_at: '2026-05-01T09:00:00.000Z',
  last_login_at: '2026-05-26T10:00:00.000Z',
  email_verified_at: '2026-05-01T09:05:00.000Z',
};

const SAMPLE_AUTH = { user: SAMPLE_USER, csrf_token: 'csrf-test-token' };

const SAMPLE_MANUAL_SUMMARY = {
  id: 'test-manual-001',
  game_id: 'test-game-001',
  game_name: 'Catan',
  title: 'Catan',
  status: 'active',
  visibility: 'private',
  language: 'spa',
  chunks_indexed: 0,
  created_at: '2026-05-26T10:00:00.000Z',
  indexed_at: '2026-05-26T10:00:10.000Z',
};

const SAMPLE_CONVERSATION = {
  id: 'conv-001',
  game_id: 'test-game-001',
  game_name: 'Catan',
  title: 'Dudas de preparación',
  created_at: '2026-05-26T10:00:00.000Z',
  updated_at: '2026-05-26T10:05:00.000Z',
};

const SAMPLE_USER_MESSAGE = {
  id: 'msg-user-001',
  role: 'user',
  content: '¿Cómo se reparten las cartas?',
  created_at: '2026-05-26T10:04:00.000Z',
};

const SAMPLE_ASSISTANT_MESSAGE = {
  id: 'msg-bot-001',
  role: 'assistant',
  content: 'Cada jugador recibe dos asentamientos y dos carreteras.',
  created_at: '2026-05-26T10:04:05.000Z',
};

/* ============================================================
   Handlers por defecto
   ============================================================ */

export const handlers = [
  http.get('/health', () => HttpResponse.json({ status: 'ok' })),

  /* -------- Auth -------- */
  http.post('/api/auth/register', async () => {
    await delay(20);
    return HttpResponse.json(SAMPLE_AUTH, { status: 201 });
  }),
  http.post('/api/auth/login', async () => {
    await delay(20);
    return HttpResponse.json(SAMPLE_AUTH);
  }),
  http.get('/api/me', () => HttpResponse.json(SAMPLE_AUTH)),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/auth/email/verify', () => HttpResponse.json({ detail: 'Email verificado.' })),
  http.post('/api/auth/email/resend', () =>
    HttpResponse.json({ detail: 'Si existe una cuenta con ese email, enviaremos un correo.' }),
  ),
  http.post('/api/auth/password/forgot', () =>
    HttpResponse.json({ detail: 'Si existe una cuenta con ese email, enviaremos instrucciones.' }),
  ),
  http.post('/api/auth/password/reset', () =>
    HttpResponse.json({ detail: 'Contraseña actualizada.' }),
  ),

  /* -------- OCR (legado) -------- */
  http.post('/api/ocr', async () => {
    await delay(50);
    return HttpResponse.json({
      lines: [
        { text: 'Bienvenido al manual de prueba.', confidence: 0.94 },
        { text: 'Pagina 1 de demostracion.', confidence: 0.88 },
      ],
    });
  }),

  /* -------- Juegos -------- */
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

  http.post('/api/games/:gameId/questions', async ({ request }) => {
    const body = (await request.json()) as { question?: string };
    await delay(30);
    return HttpResponse.json({
      answer: `Respuesta simulada para: "${body.question ?? '...'}".`,
    });
  }),

  /* -------- Manuales -------- */
  http.post('/api/manuals', async () => {
    await delay(50);
    return HttpResponse.json(
      {
        manual_id: 'test-manual-001',
        game_id: 'test-game-001',
        status: 'indexing',
        visibility: 'private',
        source_type: 'images',
        page_count: 1,
      },
      { status: 202 },
    );
  }),

  http.get('/api/manuals', () => HttpResponse.json({ manuals: [SAMPLE_MANUAL_SUMMARY] })),

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

  http.get('/api/manuals/:manualId', ({ params }) =>
    HttpResponse.json({
      ...SAMPLE_MANUAL_SUMMARY,
      id: params.manualId,
      pages: [],
    }),
  ),

  http.delete('/api/manuals/:manualId', () => new HttpResponse(null, { status: 204 })),

  http.post('/api/manuals/:manualId/questions', async ({ request }) => {
    const body = (await request.json()) as { question?: string };
    await delay(30);
    return HttpResponse.json({
      answer: `Respuesta simulada para: "${body.question ?? '...'}".`,
    });
  }),

  /* -------- Conversaciones -------- */
  http.get('/api/games/:gameId/conversations', () =>
    HttpResponse.json({ conversations: [SAMPLE_CONVERSATION] }),
  ),
  http.post('/api/games/:gameId/conversations', () =>
    HttpResponse.json(SAMPLE_CONVERSATION, { status: 201 }),
  ),
  http.get('/api/conversations/:conversationId/messages', () =>
    HttpResponse.json({ messages: [SAMPLE_USER_MESSAGE, SAMPLE_ASSISTANT_MESSAGE] }),
  ),
  http.post('/api/conversations/:conversationId/messages', async ({ request }) => {
    const body = (await request.json()) as { content?: string };
    await delay(30);
    return HttpResponse.json({
      conversation: SAMPLE_CONVERSATION,
      user_message: {
        ...SAMPLE_USER_MESSAGE,
        content: body.content ?? SAMPLE_USER_MESSAGE.content,
      },
      assistant_message: SAMPLE_ASSISTANT_MESSAGE,
    });
  }),
  http.delete('/api/conversations/:conversationId', () => new HttpResponse(null, { status: 204 })),
];

/* ============================================================
   Overrides para tests de error / estados concretos
   ============================================================ */

export function failManualCreate(status = 500) {
  return http.post('/api/manuals', () => HttpResponse.json({ detail: 'forced error' }, { status }));
}

export function failAskManual(status = 504) {
  return http.post('/api/manuals/:manualId/questions', () =>
    HttpResponse.json({ detail: 'forced error' }, { status }),
  );
}

export function failAskGame(status = 504) {
  return http.post('/api/games/:gameId/questions', () =>
    HttpResponse.json({ detail: 'forced error' }, { status }),
  );
}

/** `/api/me` sin sesión → 401 (usuario anónimo). */
export function unauthenticatedMe() {
  return http.get('/api/me', () =>
    HttpResponse.json({ detail: 'No autenticado.' }, { status: 401 }),
  );
}

export function failLogin(status = 401) {
  return http.post('/api/auth/login', () =>
    HttpResponse.json({ detail: 'Credenciales inválidas.' }, { status }),
  );
}

export function failRegister(status = 409) {
  return http.post('/api/auth/register', () =>
    HttpResponse.json({ detail: 'Ese email ya está registrado.' }, { status }),
  );
}
