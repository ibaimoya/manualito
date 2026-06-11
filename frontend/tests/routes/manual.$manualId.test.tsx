import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ManualRoute } from '@/routes/_app.manual.$manualId';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { manualDetailWithPages } from '@tests/_helpers/mswHandlers';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderManual() {
  server.use(manualDetailWithPages());
  return renderRoute({
    path: '/manual/$manualId',
    initialEntry: '/manual/test-manual-001',
    component: routeComponent(ManualRoute),
    stubs: {
      '/history': 'Historial stub',
      '/home': 'Home stub',
      '/game/$gameId': 'Juego stub',
    },
  });
}

describe('/manual/$manualId · lectura', () => {
  it('muestra el carril de páginas con su estado y el texto de la activa', async () => {
    renderManual();
    const rail = await screen.findByRole('navigation', { name: 'Páginas del manual' });
    expect(
      within(rail).getByRole('button', { name: 'Página 1 — leída correctamente' }),
    ).toBeInTheDocument();
    expect(
      within(rail).getByRole('button', { name: 'Página 2 — baja confianza' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Coloca el tablero y reparte las piezas/)).toBeInTheDocument();
  });

  it('la búsqueda cuenta coincidencias y resalta al saltar a una', async () => {
    renderManual();
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', {
      name: 'Buscar en el texto del manual',
    });
    await user.type(search, 'ladrón');
    expect(await screen.findByText(/1 en 1 pág/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
    // El cursor salta a la página 2 y marca la coincidencia activa.
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
    expect(document.querySelector('mark[data-active-match]')).toHaveTextContent(/LADRÓN/i);
  });

  it('la página de baja confianza muestra el aviso con re-proceso puntual', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Página 2 — baja confianza' }));
    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent(/baja confianza/);
    expect(
      within(aviso).getByRole('button', { name: /Re-procesar página/ }),
    ).toBeInTheDocument();
  });
});

describe('/manual/$manualId · edición de texto', () => {
  it('editar → confirmar → guarda y marca la página como editada a mano', async () => {
    // PUT estatal: la invalidación posterior debe devolver la página editada.
    let edited: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/manuals/:manualId/pages/:pageNumber/text', async ({ request, params }) => {
        const body = (await request.json()) as { text: string };
        edited = {
          page_number: Number(params.pageNumber),
          ocr_status: 'completed',
          text_source: 'user_edit',
          text_quality: 'ok',
          ocr_confidence_mean: null,
          ocr_lines: body.text.split('\n').map((text) => ({ text, confidence: null })),
        };
        return HttpResponse.json(edited);
      }),
      http.get('/api/manuals/:manualId', ({ params }) =>
        HttpResponse.json({
          id: params.manualId,
          game_id: 'test-game-001',
          game_name: 'Catan',
          title: 'Catan',
          status: 'active',
          visibility: 'private',
          language: 'spa',
          chunks_indexed: 2,
          created_at: '2026-05-26T10:00:00.000Z',
          indexed_at: '2026-05-26T10:00:10.000Z',
          pages: [
            edited ?? {
              page_number: 1,
              ocr_status: 'completed',
              text_source: 'ocr',
              text_quality: 'ok',
              ocr_confidence_mean: 0.94,
              ocr_lines: [{ text: 'PREPARACIÓN original.', confidence: 0.94 }],
            },
          ],
        }),
      ),
    );
    renderRoute({
      path: '/manual/$manualId',
      initialEntry: '/manual/test-manual-001',
      component: routeComponent(ManualRoute),
      stubs: { '/history': 'Historial stub', '/game/$gameId': 'Juego stub' },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar texto' }));
    const textarea = await screen.findByRole('textbox', { name: 'Texto de la página 1' });
    await user.clear(textarea);
    await user.type(textarea, 'PREPARACIÓN corregida a mano.');
    await user.click(screen.getByRole('button', { name: 'Guardar texto' }));

    const confirm = await screen.findByRole('dialog', { name: '¿Guardar el texto editado?' });
    expect(confirm).toHaveTextContent(/Sustituirá lo leído en la página 1/);
    await user.click(within(confirm).getByRole('button', { name: 'Guardar texto' }));

    expect(await screen.findByText('Editado a mano')).toBeInTheDocument();
    expect(screen.getByText('PREPARACIÓN corregida a mano.')).toBeInTheDocument();
  });

  it('cancelar la edición restaura la vista de lectura sin tocar nada', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar texto' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: /Texto de la página/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Coloca el tablero y reparte las piezas/)).toBeInTheDocument();
  });

  it('409 (manual ocupado): toast de error y sigue en modo edición', async () => {
    server.use(
      http.put('/api/manuals/:manualId/pages/:pageNumber/text', () =>
        HttpResponse.json({ detail: 'ocupado' }, { status: 409 }),
      ),
    );
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar texto' }));
    const textarea = await screen.findByRole('textbox', { name: 'Texto de la página 1' });
    await user.type(textarea, ' más texto');
    await user.click(screen.getByRole('button', { name: 'Guardar texto' }));
    const confirm = await screen.findByRole('dialog', { name: '¿Guardar el texto editado?' });
    await user.click(within(confirm).getByRole('button', { name: 'Guardar texto' }));

    expect(await screen.findByText('El manual se está procesando')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto de la página 1' })).toBeInTheDocument();
  });
});

describe('/manual/$manualId · acciones de cabecera', () => {
  it('re-procesar pide confirmación y lanza el POST al confirmar', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Re-procesar manual' }));
    const dialog = await screen.findByRole('dialog', { name: 'Re-procesar manual' });
    await user.click(within(dialog).getByRole('button', { name: 'Re-procesar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('borrar manual confirma, borra y navega al historial', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Borrar manual' }));
    const dialog = await screen.findByRole('dialog', { name: 'Borrar manual' });
    await user.click(within(dialog).getByRole('button', { name: /Borrar manual/ }));
    expect(await screen.findByText('Historial stub')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderManual();
    await screen.findByText(/Coloca el tablero y reparte las piezas/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
