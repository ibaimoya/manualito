import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { Route as HomeRoute } from '@/routes/_app.home';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function manual(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    game_id: 'g1',
    game_name: 'Catan',
    title: 'Catan',
    status: 'active',
    visibility: 'private',
    language: 'spa',
    chunks_indexed: 12,
    created_at: '2026-05-26T10:00:00.000Z',
    indexed_at: '2026-05-26T10:00:10.000Z',
    ...overrides,
  };
}

function renderHome() {
  return renderRoute({
    path: '/home',
    initialEntry: '/home',
    component: routeComponent(HomeRoute),
    stubs: {
      '/capture/source': 'SourceScreen',
      '/settings': 'SettingsScreen',
      '/history': 'HistoryScreen',
    },
  });
}

describe('/home', () => {
  it('saludo + CTA "Nuevo manual" presente', async () => {
    renderHome();
    expect(await screen.findByText(/¿Qué juego vamos a aprender\?/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nuevo manual/i })).toBeInTheDocument();
  });

  it('el CTA principal apunta a /capture/source', async () => {
    renderHome();
    const link = await screen.findByRole('link', { name: /Nuevo manual/i });
    expect(link).toHaveAttribute('href', '/capture/source');
  });

  it('sin manuales muestra el empty state', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [] })));
    renderHome();
    const para = await screen.findByText(/Aún no has consultado/, { selector: 'p' });
    expect(para.textContent).toMatch(/Pulsa\s+Nuevo manual\s+para empezar/);
  });

  it('muestra los manuales recientes desde el backend', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })));
    renderHome();
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    expect(screen.queryByText(/Pulsa Nuevo manual para empezar/)).not.toBeInTheDocument();
  });

  it('con recientes, "Ver todo" enlaza a /history', async () => {
    server.use(http.get('/api/manuals', () => HttpResponse.json({ manuals: [manual()] })));
    renderHome();
    const verTodo = await screen.findByRole('link', { name: /Ver todo/i });
    expect(verTodo).toHaveAttribute('href', '/history');
  });

  it('manual con created_at > 30 días → fecha corta (es-ES)', async () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    server.use(
      http.get('/api/manuals', () =>
        HttpResponse.json({
          manuals: [manual({ id: 'oldie', title: 'Viejo', game_name: 'Viejo', created_at: old })],
        }),
      ),
    );
    renderHome();
    expect(await screen.findByText('Viejo')).toBeInTheDocument();
    expect(
      screen.getByText(/\d{1,2}\s+(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)/i),
    ).toBeInTheDocument();
  });
});
