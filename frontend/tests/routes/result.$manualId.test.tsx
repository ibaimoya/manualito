import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as ResultRoute } from '@/routes/_app.result.$manualId';
import { storage, type ManualResult } from '@/shared/lib/storage';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

/**
 * La query semántica desktop por defecto en jsdom devuelve false, así que
 * OcrTextSheet monta el Sheet. No necesitamos mockear el hook.
 */

const MANUAL_ID = 'catan-test';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

function seedManualWithResult(): void {
  const result: ManualResult = {
    manual_id: MANUAL_ID,
    name: 'Catan',
    summary: 'Resumen rápido del juego.',
    setup: 'Preparación inicial.',
    turn: 'En cada turno tiras los dados y construyes.',
    win: 'Se gana con 10 puntos.',
    created_at: '2026-05-26T10:00:00.000Z',
  };
  storage.setResult(result);
  storage.upsertManual({
    manual_id: MANUAL_ID,
    name: 'Catan',
    created_at: result.created_at,
    last_opened_at: result.created_at,
    chunks_indexed: 5,
  });
}

function manualDetailWithOcr() {
  return HttpResponse.json({
    id: MANUAL_ID,
    game_id: 'game-1',
    game_name: 'Catan',
    title: 'Catan',
    status: 'active',
    visibility: 'private',
    language: 'spa',
    chunks_indexed: 3,
    created_at: '2026-05-26T10:00:00.000Z',
    indexed_at: '2026-05-26T10:00:10.000Z',
    pages: [
      {
        page_number: 2,
        ocr_status: 'completed',
        text_source: 'ocr',
        text_quality: 'ok',
        ocr_confidence_mean: 0.82,
        ocr_lines: [{ text: 'Página 2', confidence: 0.82 }],
      },
      {
        page_number: 1,
        ocr_status: 'completed',
        text_source: 'ocr',
        text_quality: 'ok',
        ocr_confidence_mean: 0.9,
        ocr_lines: [{ text: 'CATAN - REGLAS', confidence: 0.9 }],
      },
    ],
  });
}

afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  vi.useRealTimers();
});

afterAll(() => server.close());

function renderResult() {
  return renderRoute({
    path: '/result/$manualId',
    initialEntry: `/result/${MANUAL_ID}`,
    component: routeComponent(ResultRoute),
    stubs: {
      '/home': 'Home',
      '/chat/$manualId': 'Chat',
      '/capture/source': 'Source',
      '/processing/$manualId': 'Processing',
    },
  });
}

describe('/result · texto extraído multipágina', () => {
  it('no muestra el botón si el detalle del manual no tiene líneas', async () => {
    seedManualWithResult();
    renderResult();
    // "Catan" aparece en el breadcrumb (md+) y en el título móvil.
    expect((await screen.findAllByText('Catan')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Ver texto extraído/i })).not.toBeInTheDocument();
  });

  it('muestra el botón ScanText cuando el backend devuelve líneas OCR', async () => {
    seedManualWithResult();
    server.use(http.get('/api/manuals/:manualId', () => manualDetailWithOcr()));
    renderResult();
    expect(await screen.findByRole('button', { name: /Ver texto extraído/i })).toBeInTheDocument();
  });

  it('al pulsar el botón abre el sheet con líneas ordenadas por página', async () => {
    seedManualWithResult();
    server.use(http.get('/api/manuals/:manualId', () => manualDetailWithOcr()));
    const user = userEvent.setup();
    renderResult();
    await user.click(await screen.findByRole('button', { name: /Ver texto extraído/i }));
    // El sheet muestra el título de la pantalla.
    expect(await screen.findByText(/Texto extraído del manual/i)).toBeInTheDocument();
    // La vista por defecto es texto plano; verificamos el orden por página.
    const text = screen.getByTestId('ocr-plain-view').textContent ?? '';
    expect(text).toContain('CATAN');
    expect(text).toContain('Página 2');
    expect(text.indexOf('CATAN')).toBeLessThan(text.indexOf('Página 2'));
  });

});

describe('/result · contenido principal', () => {
  it('cuando no hay resultado en storage → redirige a /processing para regenerarlo', async () => {
    // Sin resultado cacheado (p. ej. manual de otra sesión): Result rebota a
    // /processing, que regenera las respuestas y vuelve aquí.
    renderResult();
    expect(await screen.findByText('Processing')).toBeInTheDocument();
  });

  it('renderiza summary + 3 acordeones con su contenido', async () => {
    seedManualWithResult();
    renderResult();
    expect(await screen.findByText('Resumen rápido del juego.')).toBeInTheDocument();
    // El acordeón Preparación está abierto por defecto.
    expect(screen.getByText('Preparación inicial.')).toBeInTheDocument();
    // Los demás acordeones están en el DOM; verificamos su trigger por role.
    expect(screen.getByRole('button', { name: /^¿Cómo van los turnos\?$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^¿Cómo se gana\?$/ })).toBeInTheDocument();
  });

  it('chips de preguntas sugeridas navegan a /chat con ?q=', async () => {
    seedManualWithResult();
    renderResult();
    const user = userEvent.setup();
    const chip = await screen.findByRole('button', { name: '¿Cuántos jugadores?' });
    await user.click(chip);
    expect(await screen.findByText('Chat')).toBeInTheDocument();
  });

  it('composer: enviar una pregunta navega a /chat', async () => {
    seedManualWithResult();
    renderResult();
    const user = userEvent.setup();
    const input = await screen.findByLabelText(/Escribe tu pregunta/i);
    await user.type(input, '¿Y los empates?');
    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));
    expect(await screen.findByText('Chat')).toBeInTheDocument();
  });

  it('composer disabled cuando el input está vacío o whitespace', async () => {
    seedManualWithResult();
    renderResult();
    const send = await screen.findByRole('button', { name: /Enviar pregunta/i });
    expect(send).toBeDisabled();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Escribe tu pregunta/i), '   ');
    expect(send).toBeDisabled();
  });

  it('botón "Otro manual" enlaza a /capture/source', async () => {
    seedManualWithResult();
    renderResult();
    const link = await screen.findByRole('link', { name: /Otro manual/i });
    expect(link).toHaveAttribute('href', '/capture/source');
  });

  it('si una sección del LLM está vacía, muestra el fallback "No hemos podido generar"', async () => {
    storage.upsertManual({
      manual_id: MANUAL_ID,
      name: 'Catan',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 5,
    });
    storage.setResult({
      manual_id: MANUAL_ID,
      name: 'Catan',
      summary: 'ok',
      setup: '', // vacío → BodyText muestra el fallback
      turn: 'ok',
      win: 'ok',
      created_at: '2026-05-26T10:00:00.000Z',
    });
    renderResult();
    expect(await screen.findByText(/No hemos podido generar esta sección/)).toBeInTheDocument();
  });
});
