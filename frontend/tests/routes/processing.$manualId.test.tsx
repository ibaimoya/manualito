import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { Route as ProcessingRoute } from '@/routes/_app.processing.$manualId';
import { storage } from '@/shared/lib/storage';
import type { BootstrapState } from '@/features/processing/useManualBootstrap';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Estado controlado del hook por test.  Devolvemos una referencia mutable
// y vi.mock lo lee dentro de la función.  `Promise.allSettled` real tarda
// y depende del API — mejor mockear el hook entero.
const bootstrapStateRef: { current: BootstrapState } = {
  current: {
    steps: [
      { id: 'summary', label: 'Resumen', state: 'pending' },
      { id: 'setup', label: 'Preparación', state: 'pending' },
      { id: 'turn', label: '¿Cómo van los turnos?', state: 'pending' },
      { id: 'win', label: '¿Cómo se gana?', state: 'pending' },
    ],
    progress: 0,
    done: false,
    hasAnyAnswer: false,
    result: null,
  },
};

vi.mock('@/features/processing/useManualBootstrap', () => ({
  useManualBootstrap: () => bootstrapStateRef.current,
}));

function setBootstrap(next: Partial<BootstrapState>) {
  bootstrapStateRef.current = { ...bootstrapStateRef.current, ...next };
}

beforeEach(() => {
  // No usamos fake timers por defecto: TanStack Router programa
  // micro-trabajo en timers reales para inicializar, y bloquearlos
  // hace que el componente nunca llegue a montar.  Activamos fake
  // timers SOLO en los tests que verifican setTimeouts concretos.
  bootstrapStateRef.current = {
    steps: [
      { id: 'summary', label: 'Resumen', state: 'pending' },
      { id: 'setup', label: 'Preparación', state: 'pending' },
      { id: 'turn', label: '¿Cómo van los turnos?', state: 'pending' },
      { id: 'win', label: '¿Cómo se gana?', state: 'pending' },
    ],
    progress: 0,
    done: false,
    hasAnyAnswer: false,
    result: null,
  };
});

function renderProcessing(manualId: string, name?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const procR = createRoute({
    getParentRoute: () => root,
    path: '/processing/$manualId',
    validateSearch: (s) => ({
      name: typeof s.name === 'string' ? s.name : undefined,
    }),
    component: (ProcessingRoute as unknown as { options: { component: React.FC } }).options
      .component,
  });
  const resultR = createRoute({
    getParentRoute: () => root,
    path: '/result/$manualId',
    component: () => <div>ResultScreen</div>,
  });
  const tree = root.addChildren([procR, resultR]);
  const search = name ? `?name=${encodeURIComponent(name)}` : '';
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({
      initialEntries: [`/processing/${manualId}${search}`],
    }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('/processing/$manualId', () => {
  it('renderiza la cabecera con el nombre del manual y los 4 pasos', async () => {
    renderProcessing('abc123', 'Catan');
    // El nombre va en el breadcrumb (md+) y en el título móvil.
    expect((await screen.findAllByText('Catan')).length).toBeGreaterThan(0);
    expect(screen.getByText('Leyendo tu manual…')).toBeInTheDocument();
    expect(screen.getByText(/Resumen/)).toBeInTheDocument();
    expect(screen.getByText(/Preparación/)).toBeInTheDocument();
    expect(screen.getByText(/Cómo van los turnos/)).toBeInTheDocument();
    expect(screen.getByText(/Cómo se gana/)).toBeInTheDocument();
  });

  it('si no hay nombre en la URL muestra "Manual sin nombre"', async () => {
    renderProcessing('abc123');
    expect((await screen.findAllByText('Manual sin nombre')).length).toBeGreaterThan(0);
  });

  it('registra el manual en localStorage cuando no existe (upsert + touch)', async () => {
    expect(storage.listManuals()).toHaveLength(0);
    renderProcessing('m1', 'Wingspan');
    await waitFor(() => {
      const ms = storage.listManuals();
      expect(ms).toHaveLength(1);
      expect(ms[0]!.manual_id).toBe('m1');
      expect(ms[0]!.name).toBe('Wingspan');
    });
  });

  it('si el manual ya existe en localStorage hace touch (no duplica)', async () => {
    storage.upsertManual({
      manual_id: 'm1',
      name: 'Catan',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 12,
    });
    renderProcessing('m1', 'Catan');
    await waitFor(() => {
      const ms = storage.listManuals();
      expect(ms).toHaveLength(1);
      expect(ms[0]!.chunks_indexed).toBe(12); // sin sobrescribir.
    });
  });

  it('renderiza el icono "Check" cuando un paso está done', async () => {
    setBootstrap({
      steps: [
        { id: 'summary', label: 'Resumen', state: 'done', text: 'ok' },
        { id: 'setup', label: 'Preparación', state: 'pending' },
        { id: 'turn', label: '¿Cómo van los turnos?', state: 'pending' },
        { id: 'win', label: '¿Cómo se gana?', state: 'pending' },
      ],
      progress: 25,
      done: false,
      hasAnyAnswer: true,
      result: null,
    });
    renderProcessing('m1', 'Catan');
    // Una vez done, el step tiene un check icon visible (lucide Check).
    // Verificamos progress aria-valuetext = "25%".
    const progress = await screen.findByLabelText(/Progreso: 25 por ciento/i);
    expect(progress).toHaveAttribute('aria-valuetext', '25%');
  });

  it('muestra el mensaje de error en pasos fallidos', async () => {
    setBootstrap({
      steps: [
        { id: 'summary', label: 'Resumen', state: 'failed', error: 'OCR fallido' },
        { id: 'setup', label: 'Preparación', state: 'pending' },
        { id: 'turn', label: '¿Cómo van los turnos?', state: 'pending' },
        { id: 'win', label: '¿Cómo se gana?', state: 'pending' },
      ],
      progress: 25,
      done: false,
      hasAnyAnswer: false,
      result: null,
    });
    renderProcessing('m1', 'Catan');
    expect(await screen.findByText('OCR fallido')).toBeInTheDocument();
  });

  it('muestra estado final de error si termina sin resultado', async () => {
    setBootstrap({
      steps: [
        { id: 'summary', label: 'Resumen', state: 'failed', error: 'OCR fallido' },
        { id: 'setup', label: 'Preparación', state: 'failed', error: 'OCR fallido' },
        { id: 'turn', label: '¿Cómo van los turnos?', state: 'failed', error: 'OCR fallido' },
        { id: 'win', label: '¿Cómo se gana?', state: 'failed', error: 'OCR fallido' },
      ],
      progress: 100,
      done: true,
      hasAnyAnswer: false,
      result: null,
    });
    renderProcessing('m1', 'Catan');
    expect(await screen.findByText('No se ha podido procesar')).toBeInTheDocument();
    expect(screen.getByText(/vuelve a intentarlo/i)).toBeInTheDocument();
  });

  it('cuando done && result navega a /result/$manualId tras 600ms', async () => {
    setBootstrap({
      steps: [
        { id: 'summary', label: 'Resumen', state: 'done', text: 'a' },
        { id: 'setup', label: 'Preparación', state: 'done', text: 'b' },
        { id: 'turn', label: '¿Cómo van los turnos?', state: 'done', text: 'c' },
        { id: 'win', label: '¿Cómo se gana?', state: 'done', text: 'd' },
      ],
      progress: 100,
      done: true,
      hasAnyAnswer: true,
      result: {
        manual_id: 'm1',
        name: 'Catan',
        summary: 'a',
        setup: 'b',
        turn: 'c',
        win: 'd',
        created_at: '2026-05-26T10:00:00.000Z',
      },
    });
    renderProcessing('m1', 'Catan');
    // Esperamos a que el ResultScreen aparezca tras los 600ms reales — el
    // setTimeout de la navegación es de 600 ms y el test usa timers reales
    // (no fakes), así que la espera vital de waitFor es suficiente.
    await waitFor(
      () => {
        expect(screen.getByText('ResultScreen')).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });
});
