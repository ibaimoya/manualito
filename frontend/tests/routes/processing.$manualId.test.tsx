import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route as ProcessingRoute } from '@/routes/_app.processing.$manualId';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
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
    },
  });
}

describe('/processing/$manualId', () => {
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
    await waitFor(() => expect(screen.getByText('GameHubScreen')).toBeInTheDocument(), {
      timeout: 2500,
    });
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
    await waitFor(() => expect(screen.getByText('GameHubScreen')).toBeInTheDocument(), {
      timeout: 4500,
    });
    expect(calls).toBeGreaterThan(1);
  });

  it('estado failed del backend → pantalla de error sin barra de progreso', async () => {
    stubProcessing('failed');
    renderProcessing('m1', 'Catan');
    expect(await screen.findByText('No se ha podido procesar')).toBeInTheDocument();
    expect(screen.getByText(/vuelve a intentarlo/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('error consultando el estado → pantalla de error', async () => {
    server.use(
      http.get('/api/manuals/:manualId/processing', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );
    renderProcessing('m1', 'Catan');
    expect(await screen.findByText('No se ha podido procesar')).toBeInTheDocument();
  });
});
