import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
import { ThemeProvider } from '@/app/theme';
import { Route as ResultRoute } from './result.$manualId';
import { storage, type ManualResult, type OcrLine } from '@/shared/lib/storage';

/**
 * La query semántica desktop por defecto en jsdom devuelve false, así que
 * OcrTextSheet monta el Sheet. No necesitamos mockear el hook.
 */

const MANUAL_ID = 'catan-test';

function seedManualWithResult(opts: { withOcr: boolean }): void {
  const result: ManualResult = {
    manual_id: MANUAL_ID,
    name: 'Catan',
    summary: 'Resumen rápido del juego.',
    setup: 'Preparación inicial.',
    turn: 'Cómo es un turno.',
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
  if (opts.withOcr) {
    const lines: OcrLine[] = [
      { text: 'CATAN — REGLAS', confidence: 0.97 },
      { text: 'Construye carreteras.', confidence: 0.71 },
      { text: 'Borrosa', confidence: 0.28 },
    ];
    storage.setOcrLines(MANUAL_ID, lines);
  }
}

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function renderResult() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const resultR = createRoute({
    getParentRoute: () => root,
    path: '/result/$manualId',
    component: (ResultRoute as unknown as { options: { component: React.FC } }).options
      .component,
  });
  const homeR = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div>Home</div>,
  });
  const chatR = createRoute({
    getParentRoute: () => root,
    path: '/chat/$manualId',
    component: () => <div>Chat</div>,
  });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: () => <div>Source</div>,
  });
  const tree = root.addChildren([resultR, homeR, chatR, sourceR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [`/result/${MANUAL_ID}`] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/result · "Ver texto original" (B1)', () => {
  it('NO muestra el botón si el manual no tiene ocr_lines persistidas', async () => {
    seedManualWithResult({ withOcr: false });
    renderResult();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Ver texto original/i }),
    ).not.toBeInTheDocument();
  });

  it('muestra el botón ScanText cuando hay ocr_lines persistidas', async () => {
    seedManualWithResult({ withOcr: true });
    renderResult();
    expect(
      await screen.findByRole('button', { name: /Ver texto original/i }),
    ).toBeInTheDocument();
  });

  it('al pulsar el botón abre el sheet con el viewer y las líneas', async () => {
    seedManualWithResult({ withOcr: true });
    const user = userEvent.setup();
    renderResult();
    await user.click(
      await screen.findByRole('button', { name: /Ver texto original/i }),
    );
    // El sheet muestra el título de la pantalla.
    expect(
      await screen.findByText(/Texto original del manual/i),
    ).toBeInTheDocument();
    // Y las líneas reales (vista 'lines' por defecto en el wrapper).
    expect(screen.getByTestId('ocr-lines-view').textContent).toContain('CATAN');
    expect(screen.getByTestId('ocr-lines-view').textContent).toContain('Borrosa');
  });

  it('no dispara ninguna petición HTTP al abrir el viewer (todo desde localStorage)', async () => {
    // Si el viewer hiciera POST /api/ocr aquí, fetch global sería invocado.
    // Espiamos fetch para asegurar que cero llamadas se hacen.
    seedManualWithResult({ withOcr: true });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = userEvent.setup();
    renderResult();
    await user.click(
      await screen.findByRole('button', { name: /Ver texto original/i }),
    );
    await screen.findByText(/Texto original del manual/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
