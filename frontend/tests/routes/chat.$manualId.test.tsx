import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { http, HttpResponse, delay } from 'msw';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/theme';
import { Route as ChatRoute } from '@/routes/_app.chat.$manualId';
import { storage } from '@/shared/lib/storage';
import { server } from '@tests/_helpers/server';
import { failSendMessage } from '@tests/_helpers/mswHandlers';

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

function seedManual(manualId: string, name = 'Catan') {
  storage.upsertManual({
    manual_id: manualId,
    name,
    created_at: '2026-05-26T10:00:00.000Z',
    last_opened_at: '2026-05-26T10:00:00.000Z',
    chunks_indexed: 12,
  });
  storage.setResult({
    manual_id: manualId,
    name,
    summary: 's',
    setup: 'a',
    turn: 'b',
    win: 'c',
    created_at: '2026-05-26T10:00:00.000Z',
  });
}

function renderChat(manualId: string, search?: { q?: string; c?: string }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const chatR = createRoute({
    getParentRoute: () => root,
    path: '/chat/$manualId',
    validateSearch: (s) => ({
      q: typeof s.q === 'string' ? s.q : undefined,
      c: typeof s.c === 'string' ? s.c : undefined,
    }),
    component: (ChatRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const resultR = createRoute({
    getParentRoute: () => root,
    path: '/result/$manualId',
    component: () => <div>ResultScreen</div>,
  });
  const tree = root.addChildren([chatR, resultR]);
  const params = new URLSearchParams();
  if (search?.q) params.set('q', search.q);
  if (search?.c) params.set('c', search.c);
  const queryStr = params.size > 0 ? `?${params.toString()}` : '';
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/chat/${manualId}${queryStr}`],
    }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/chat/$manualId', () => {
  it('renderiza el nombre del manual en el header', async () => {
    seedManual('m1', 'Wingspan');
    renderChat('m1');
    // El nombre aparece en el breadcrumb (md+) y en el título móvil.
    expect((await screen.findAllByText('Wingspan')).length).toBeGreaterThan(0);
  });

  it('si no hay manual en local muestra el fallback "Manual"', async () => {
    renderChat('mDesconocido');
    expect((await screen.findAllByText('Manual')).length).toBeGreaterThan(0);
  });

  it('empty state cuando se abre un chat nuevo (sin conversación)', async () => {
    seedManual('m1');
    renderChat('m1');
    expect(await screen.findByText(/Empieza con una pregunta sobre el manual/)).toBeInTheDocument();
  });

  it('?c=… reabre la conversación y muestra su historial del servidor', async () => {
    seedManual('m1');
    renderChat('m1', { c: 'conv-001' });
    // Mensajes de SAMPLE en el handler MSW por defecto.
    expect(await screen.findByText('¿Cómo se reparten las cartas?')).toBeInTheDocument();
    expect(
      screen.getByText('Cada jugador recibe dos asentamientos y dos carreteras.'),
    ).toBeInTheDocument();
  });

  it('al enviar una pregunta: burbuja optimista + respuesta del backend', async () => {
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '¿Y empate?');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Mensaje del usuario aparece inmediato (optimistic UI).
    expect(await screen.findByText('¿Y empate?')).toBeInTheDocument();

    // El backend (MSW) responde el turno completo.
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

  it('preguntas vacías o solo whitespace NO se envían', async () => {
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '   ');
    const send = screen.getByRole('button', { name: /Enviar pregunta/i });
    // El botón debe estar disabled (draft.trim().length === 0).
    expect(send).toBeDisabled();
  });

  it('si la URL trae ?q=foo, dispara la pregunta automáticamente al montar', async () => {
    seedManual('m1');
    renderChat('m1', { q: '¿Cuántos jugadores hay?' });
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
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
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

  it('header tiene enlace "Volver al resumen" hacia /result/$manualId', async () => {
    seedManual('m1');
    renderChat('m1');
    const link = await screen.findByRole('link', { name: /Volver al resumen/i });
    expect(link).toHaveAttribute('href', '/result/m1');
  });

  it('badge "Listo" presente en el header del chat', async () => {
    seedManual('m1');
    renderChat('m1');
    expect(await screen.findByText('Listo')).toBeInTheDocument();
  });

  it('muestra las páginas citadas (sources) bajo la respuesta del bot, deduplicadas', async () => {
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
            sources: [
              { manual_id: 'm1', manual_title: 'Catan', page: 4 },
              { manual_id: 'm1', manual_title: 'Catan', page: 4 },
              { manual_id: 'm1', manual_title: 'Catan', page: 7 },
            ],
          },
        }),
      ),
    );
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Escribe tu pregunta/i), 'madera');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));
    expect(await screen.findByText('Pág. 4')).toBeInTheDocument();
    expect(screen.getByText('Pág. 7')).toBeInTheDocument();
    // La página 4 viene dos veces pero se muestra un único chip.
    expect(screen.getAllByText('Pág. 4')).toHaveLength(1);
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
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, 'tarda');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // El typing indicator usa <output aria-label="Escribiendo respuesta">.
    expect(
      await screen.findByRole('status', { name: /Escribiendo respuesta/i }),
    ).toBeInTheDocument();
  });
});
