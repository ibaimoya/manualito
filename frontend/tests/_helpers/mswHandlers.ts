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
  avatar_color: null,
  avatar_figure: null,
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

export const SAMPLE_GAME_DETAIL = {
  id: 'test-game-001',
  name: 'Catan',
  bgg_id: 13,
  year_published: 1995,
  min_players: 3,
  max_players: 4,
  playing_time_minutes: 90,
  status: 'active',
  my_rating: null,
  manuals: [
    {
      id: 'test-manual-001',
      title: 'Reglas base',
      source_type: 'images',
      page_count: 2,
      created_at: '2026-05-26T10:00:00.000Z',
      is_own: true,
    },
    {
      id: 'test-manual-002',
      title: 'Expansión',
      source_type: 'pdf',
      page_count: 12,
      created_at: '2026-04-02T10:00:00.000Z',
      is_own: false,
    },
  ],
  conversations_count: 1,
  attribution: 'Game data provided by BoardGameGeek.',
};

const SAMPLE_EXPLANATION_SECTION = {
  answer: 'Respuesta de la sección.',
  sources: [{ manual_id: 'test-manual-001', manual_title: 'Reglas base', page: 1 }],
};

const SAMPLE_EXPLANATION = {
  status: 'ready',
  sections: {
    summary: { ...SAMPLE_EXPLANATION_SECTION, answer: 'Catan va de construir y comerciar.' },
    setup: { ...SAMPLE_EXPLANATION_SECTION, answer: 'Monta el tablero y reparte piezas.' },
    turns: { ...SAMPLE_EXPLANATION_SECTION, answer: 'Tira dados, recoge recursos y construye.' },
    victory: { ...SAMPLE_EXPLANATION_SECTION, answer: 'Gana quien llega a 10 puntos.' },
  },
  generated_at: '2026-05-26T12:00:00.000Z',
};

const SAMPLE_MANUAL_PAGES = [
  {
    page_number: 1,
    ocr_status: 'completed',
    text_source: 'ocr',
    text_quality: 'ok',
    ocr_confidence_mean: 0.94,
    ocr_lines: [
      { text: 'PREPARACIÓN', confidence: 0.97 },
      { text: 'Coloca el tablero y reparte las piezas a cada jugador.', confidence: 0.92 },
    ],
  },
  {
    page_number: 2,
    ocr_status: 'completed',
    text_source: 'ocr',
    text_quality: 'low_confidence',
    ocr_confidence_mean: 0.55,
    ocr_lines: [{ text: 'EL LADRÓN bloquea la casilla donde está.', confidence: 0.55 }],
  },
];

const SAMPLE_USER_MESSAGE = {
  id: 'msg-user-001',
  role: 'user',
  content: '¿Cómo se reparten las cartas?',
  created_at: '2026-05-26T10:04:00.000Z',
  sources: [],
};

const SAMPLE_ASSISTANT_MESSAGE = {
  id: 'msg-bot-001',
  role: 'assistant',
  content: 'Cada jugador recibe dos asentamientos y dos carreteras.',
  created_at: '2026-05-26T10:04:05.000Z',
  sources: [],
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

  /* -------- Cuenta -------- */
  http.get('/api/me/stats', () =>
    HttpResponse.json({ games_count: 4, conversations_count: 7, manuals_count: 3 }),
  ),
  http.patch('/api/me', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      user: { ...SAMPLE_USER, ...body },
      csrf_token: 'csrf-test-token',
    });
  }),
  http.post('/api/me/password', () => HttpResponse.json({ detail: 'Contraseña actualizada.' })),
  http.delete('/api/me', () => new HttpResponse(null, { status: 204 })),

  /* -------- OCR (legado) -------- */
  http.post('/api/ocr', async () => {
    await delay(50);
    return HttpResponse.json({
      lines: [
        { text: 'Bienvenido al manual de prueba.', confidence: 0.94 },
        { text: 'Página 1 de demostración.', confidence: 0.88 },
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

  http.get('/api/games/:gameId', () => HttpResponse.json(SAMPLE_GAME_DETAIL)),

  http.get('/api/games/:gameId/explanation', () => HttpResponse.json(SAMPLE_EXPLANATION)),

  http.put('/api/games/:gameId/rating', async ({ request, params }) => {
    const body = (await request.json()) as { score: number; note?: string };
    return HttpResponse.json({
      game_id: params.gameId,
      score: body.score,
      note: body.note ?? null,
      created_at: '2026-05-26T12:00:00.000Z',
      updated_at: '2026-05-26T12:00:00.000Z',
    });
  }),
  http.delete('/api/games/:gameId/rating', () => new HttpResponse(null, { status: 204 })),

  http.post('/api/games/:gameId/questions', async ({ request }) => {
    const body = (await request.json()) as { question?: string };
    await delay(30);
    return HttpResponse.json({
      answer: `Respuesta simulada para: "${body.question ?? '...'}".`,
      sources: [],
    });
  }),

  http.get('/api/recommendations', () =>
    HttpResponse.json({
      recommendations: [
        { id: 'rec-1', name: 'Carcassonne', bgg_id: 822, year_published: 2000, reason: 'Porque tienes Catan' },
        { id: 'rec-2', name: 'Ticket to Ride', bgg_id: 9209, year_published: 2004, reason: 'Familiar y de rutas' },
        { id: 'rec-3', name: 'Azul', bgg_id: 230802, year_published: 2017, reason: 'Estrategia ligera muy valorada' },
      ],
      attribution: 'Game data provided by BoardGameGeek.',
    }),
  ),

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

  http.put('/api/manuals/:manualId/pages/:pageNumber/text', async ({ request, params }) => {
    const body = (await request.json()) as { text: string };
    return HttpResponse.json({
      page_number: Number(params.pageNumber),
      ocr_status: 'completed',
      text_source: 'user_edit',
      text_quality: 'ok',
      ocr_confidence_mean: null,
      ocr_lines: body.text.split('\n').map((text) => ({ text, confidence: null })),
    });
  }),

  http.post('/api/manuals/:manualId/reprocess', () =>
    HttpResponse.json(
      {
        manual_id: 'test-manual-001',
        status: 'indexing',
        page_count: 2,
        completed_pages: 0,
        failed_pages: 0,
        pages: [
          { page_number: 1, ocr_status: 'pending', text_quality: null },
          { page_number: 2, ocr_status: 'pending', text_quality: null },
        ],
      },
      { status: 202 },
    ),
  ),

  http.post('/api/manuals/:manualId/pages/:pageNumber/reprocess', () =>
    HttpResponse.json(
      {
        manual_id: 'test-manual-001',
        status: 'indexing',
        page_count: 2,
        completed_pages: 1,
        failed_pages: 0,
        pages: [
          { page_number: 1, ocr_status: 'completed', text_quality: 'ok' },
          { page_number: 2, ocr_status: 'pending', text_quality: null },
        ],
      },
      { status: 202 },
    ),
  ),

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
        id: `msg-user-${crypto.randomUUID()}`,
        content: body.content ?? SAMPLE_USER_MESSAGE.content,
      },
      assistant_message: {
        ...SAMPLE_ASSISTANT_MESSAGE,
        id: `msg-bot-${crypto.randomUUID()}`,
      },
    });
  }),
  http.patch('/api/conversations/:conversationId', async ({ request, params }) => {
    const body = (await request.json()) as { title: string };
    return HttpResponse.json({ ...SAMPLE_CONVERSATION, id: params.conversationId, title: body.title });
  }),
  http.delete('/api/conversations/:conversationId', () => new HttpResponse(null, { status: 204 })),
];

/** Detalle de manual con páginas OCR reales (una OK y una de baja confianza). */
export function manualDetailWithPages() {
  return http.get('/api/manuals/:manualId', ({ params }) =>
    HttpResponse.json({
      ...SAMPLE_MANUAL_SUMMARY,
      id: params.manualId,
      pages: SAMPLE_MANUAL_PAGES,
    }),
  );
}

/* ============================================================
   Overrides para tests de error / estados concretos
   ============================================================ */

export function failSendMessage(status = 504) {
  return http.post('/api/conversations/:conversationId/messages', () =>
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

/**
 * Registro fallido con la forma REAL del backend. El 409
 * (`DuplicateIdentityError`) no revela si el duplicado es el email o el
 * usuario: devuelve el código neutro `identity_unavailable`.
 */
export function failRegister(status = 409) {
  const body =
    status === 409
      ? {
          detail: 'Email o username no disponible.',
          errors: [
            {
              field: null,
              code: 'identity_unavailable',
              message: 'Email o username no disponible.',
            },
          ],
        }
      : { detail: 'forced error' };
  return http.post('/api/auth/register', () => HttpResponse.json(body, { status }));
}

/** Registro con 422 de validación de campo del backend (p. ej. regla de username). */
export function failRegisterValidation() {
  return http.post('/api/auth/register', () =>
    HttpResponse.json(
      {
        detail: 'Datos inválidos.',
        errors: [
          {
            field: 'username',
            code: 'username_invalid',
            message: 'El nombre de usuario solo puede contener letras, números, puntos y guiones.',
          },
        ],
      },
      { status: 422 },
    ),
  );
}
