import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as ProcessingRoute } from '@/routes/_app.processing.$manualId';
import { server } from '@tests/_helpers/server';
import { manualDetailWithPages } from '@tests/_helpers/mswHandlers';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

function stubProcessing(status: string, completed = 0, pageCount = 2) {
  server.use(
    http.get('/api/manuals/:manualId/processing', ({ params }) =>
      HttpResponse.json({
        manual_id: params.manualId,
        status,
        page_count: pageCount,
        completed_pages: completed,
        failed_pages: 0,
        pages: [],
      }),
    ),
  );
}

function renderProcessing(manualId: string, name?: string) {
  const search = name ? `?name=${encodeURIComponent(name)}` : '';
  return renderRoute({
    path: '/processing/$manualId',
    initialEntry: `/processing/${manualId}${search}`,
    component: routeComponent(ProcessingRoute),
    validateSearch: (s) => ({
      name: typeof s.name === 'string' ? s.name : undefined,
    }),
    stubs: {
      '/game/$gameId': 'GameHubScreen',
      '/history': 'Biblioteca',
      '/capture/source': 'Subir manual',
    },
  });
}

describe('/processing/$manualId', () => {
  it.each(['indexing', 'failed'])(
    'no sale de un manual %s aunque su detalle esté en caché',
    async (status) => {
      stubProcessing(status);
      const { qc, router } = renderProcessing('cached-manual', 'Catan');
      await waitFor(() => {
        expect(qc.getQueryState(['manuals', 'processing', 'cached-manual'])?.status).toBe(
          'success',
        );
      });
      vi.useFakeTimers();
      act(() => {
        qc.setQueryData(['manuals', 'detail', 'cached-manual'], {
          id: 'cached-manual',
          game_id: 'test-game-001',
        });
      });
      // Supera el tiempo de salida de 600 ms para comprobar que no se programó.
      await act(() => vi.advanceTimersByTimeAsync(700));
      expect(router.state.location.pathname).toBe('/processing/cached-manual');
      expect(screen.queryByText('GameHubScreen')).not.toBeInTheDocument();
    },
  );

  it('muestra el nombre del manual y el progreso de páginas mientras indexa', async () => {
    stubProcessing('indexing', 1, 2);
    renderProcessing('m1', 'Catan');
    // El nombre va en el breadcrumb (md+) y en el título móvil.
    expect((await screen.findAllByText('Catan')).length).toBeGreaterThan(0);
    expect(screen.getByText('Leyendo tu manual…')).toBeInTheDocument();
    const progress = await screen.findByLabelText(/Progreso: 50 por ciento/i);
    expect(progress).toHaveAttribute('aria-valuetext', '50%');
    expect(screen.getByText('1/2 páginas')).toBeInTheDocument();
  });

  it('si no hay nombre en la URL muestra "Manual sin nombre"', async () => {
    stubProcessing('indexing');
    renderProcessing('m1');
    expect((await screen.findAllByText('Manual sin nombre')).length).toBeGreaterThan(0);
  });

  it('al terminar el indexado navega al hub del juego', async () => {
    renderProcessing('test-manual-001', 'Catan');
    expect(
      await screen.findByText('GameHubScreen', undefined, { timeout: 2500 }),
    ).toBeInTheDocument();
  });

  it('sigue sondeando mientras indexa y salta al hub cuando termina', async () => {
    let calls = 0;
    server.use(
      http.get('/api/manuals/:manualId/processing', ({ params }) => {
        calls += 1;
        return HttpResponse.json({
          manual_id: params.manualId,
          status: calls > 1 ? 'active' : 'indexing',
          page_count: 1,
          completed_pages: calls > 1 ? 1 : 0,
          failed_pages: 0,
          pages: [],
        });
      }),
    );
    renderProcessing('test-manual-001', 'Catan');
    expect(await screen.findByText('Leyendo tu manual…')).toBeInTheDocument();
    expect(
      await screen.findByText('GameHubScreen', undefined, { timeout: 4500 }),
    ).toBeInTheDocument();
    expect(calls).toBeGreaterThan(1);
  });

  it('un procesamiento fallido ofrece subir otra copia, sin fingir un reintento de OCR', async () => {
    stubProcessing('failed');
    renderProcessing('m1', 'Catan');
    expect(await screen.findByText('No se ha podido procesar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a mi biblioteca' })).toHaveAttribute(
      'href',
      '/history',
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Subir otro manual' }));
    expect(await screen.findByText('Subir manual')).toBeInTheDocument();
  });

  it.each([
    { status: 404, title: 'No hemos encontrado este manual', retry: false },
    { status: null, title: 'No podemos consultar el progreso', retry: true },
  ])(
    'un fallo de consulta $status no afirma que el procesamiento haya fallado',
    async ({ status, title, retry }) => {
      server.use(
        http.get('/api/manuals/:manualId/processing', () =>
          status === null ? HttpResponse.error() : HttpResponse.json({}, { status }),
        ),
      );
      renderProcessing('m1', 'Catan');
      await screen.findByRole('heading', { name: title });
      expect(screen.queryByText('No se ha podido procesar')).not.toBeInTheDocument();
      expect(Boolean(screen.queryByRole('button', { name: 'Reintentar' }))).toBe(retry);
    },
  );

  it('reintenta la consulta una sola vez y retoma el progreso existente', async () => {
    const user = userEvent.setup();
    let requests = 0;
    // Solo se retiene la respuesta HTTP, el router y las consultas siguen siendo reales.
    const response = Promise.withResolvers<void>();
    server.use(
      http.get('/api/manuals/:manualId/processing', async ({ params }) => {
        requests += 1;
        if (requests === 1) return HttpResponse.json({}, { status: 503 });
        await response.promise;
        return HttpResponse.json({
          manual_id: params.manualId,
          status: 'indexing',
          page_count: 2,
          completed_pages: 1,
          failed_pages: 0,
          pages: [],
        });
      }),
    );
    renderProcessing('m1', 'Catan');
    const heading = await screen.findByRole('heading', { name: 'No podemos consultar el manual' });
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    await user.click(retry);
    await user.click(retry);
    await waitFor(() => expect(requests).toBe(2));
    expect(retry).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'No podemos consultar el manual' })).toBe(heading);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await act(async () => response.resolve());
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(requests).toBe(2);
  });

  it('si falla abrir el detalle al terminar, reintenta ese detalle y continúa al juego', async () => {
    stubProcessing('active', 2, 2);
    server.use(
      http.get('/api/manuals/:manualId', () => HttpResponse.json({}, { status: 503 }), {
        once: true,
      }),
      manualDetailWithPages(),
    );
    renderProcessing('m1', 'Catan');
    await screen.findByRole('heading', { name: 'No podemos consultar el manual' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('GameHubScreen')).toBeInTheDocument();
  });
});
