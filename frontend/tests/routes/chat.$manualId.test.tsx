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
import { Route as ChatRoute } from '@/routes/chat.$manualId';
import { storage } from '@/shared/lib/storage';
import { server } from '@tests/_helpers/server';
import { failAskManual } from '@tests/_helpers/mswHandlers';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

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

function renderChat(manualId: string, initialQuestion?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const chatR = createRoute({
    getParentRoute: () => root,
    path: '/chat/$manualId',
    validateSearch: (s) => ({
      q: typeof s.q === 'string' ? s.q : undefined,
    }),
    component: (
      ChatRoute as unknown as { options: { component: React.FC } }
    ).options.component,
  });
  const resultR = createRoute({
    getParentRoute: () => root,
    path: '/result/$manualId',
    component: () => <div>ResultScreen</div>,
  });
  const tree = root.addChildren([chatR, resultR]);
  const search = initialQuestion ? `?q=${encodeURIComponent(initialQuestion)}` : '';
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/chat/${manualId}${search}`],
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
    expect(await screen.findByText('Wingspan')).toBeInTheDocument();
  });

  it('si no hay manual en local muestra el fallback "Manual"', async () => {
    renderChat('mDesconocido');
    expect(await screen.findByText('Manual')).toBeInTheDocument();
  });

  it('empty state cuando no hay mensajes guardados', async () => {
    seedManual('m1');
    renderChat('m1');
    expect(
      await screen.findByText(/Empieza con una pregunta sobre el manual/),
    ).toBeInTheDocument();
  });

  it('muestra mensajes previos del historial (lazy initializer sin flash)', async () => {
    seedManual('m1');
    storage.appendQA('m1', {
      id: 'qa-1',
      role: 'user',
      text: '¿Cuántos jugadores?',
      ts: '2026-05-26T10:00:00.000Z',
    });
    storage.appendQA('m1', {
      id: 'qa-2',
      role: 'bot',
      text: 'De 2 a 5 jugadores.',
      ts: '2026-05-26T10:00:01.000Z',
    });
    renderChat('m1');
    expect(await screen.findByText('¿Cuántos jugadores?')).toBeInTheDocument();
    expect(screen.getByText('De 2 a 5 jugadores.')).toBeInTheDocument();
  });

  it('al enviar una pregunta: aparece el mensaje user + bot tras la respuesta', async () => {
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '¿Y empate?');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Mensaje del usuario aparece inmediato (optimistic UI).
    expect(await screen.findByText('¿Y empate?')).toBeInTheDocument();

    // Bot responde según el handler MSW por defecto.
    await waitFor(
      () => {
        expect(
          screen.getByText(/Respuesta simulada para: "¿Y empate\?"/),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Persistencia: ambos mensajes en localStorage.
    await waitFor(() => {
      expect(storage.listQA('m1')).toHaveLength(2);
    });
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
    renderChat('m1', '¿Cuántos jugadores hay?');
    // El mensaje del usuario aparece inmediato.
    expect(await screen.findByText('¿Cuántos jugadores hay?')).toBeInTheDocument();
    // Y la respuesta del bot llega tras la mutation.
    await waitFor(
      () => {
        expect(
          screen.getByText(/Respuesta simulada para: "¿Cuántos jugadores hay\?"/),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('si el LLM falla con 504, muestra toast de error (no rompe la app)', async () => {
    server.use(failAskManual(504));
    seedManual('m1');
    renderChat('m1');
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, 'fail');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));

    // Pregunta del usuario sigue en pantalla.
    expect(await screen.findByText('fail')).toBeInTheDocument();
    // Toast de error: el mapper traduce 504 → "Tiempo de espera agotado".
    await waitFor(
      () => {
        expect(screen.getByText(/Tiempo de espera agotado/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
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

  it('typing indicator mientras la mutation está en vuelo', async () => {
    // Forzamos un delay alto para ver el indicator.
    server.use(
      http.post('/api/manuals/:manualId/questions', async () => {
        await delay(500);
        return HttpResponse.json({ answer: 'tardío' });
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
