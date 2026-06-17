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

function renderManual(page?: number) {
  server.use(manualDetailWithPages());
  return renderRoute({
    path: '/manual/$manualId',
    initialEntry: page ? `/manual/test-manual-001?page=${page}` : '/manual/test-manual-001',
    component: routeComponent(ManualRoute),
    validateSearch: (s) => {
      const n = Number(s.page);
      return Number.isInteger(n) && n > 0 ? { page: n } : {};
    },
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
      within(rail).getByRole('button', { name: 'Página 1 · Escaneado correctamente' }),
    ).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Página 2 · Poco clara' })).toBeInTheDocument();
    expect(screen.getByText(/Coloca el tablero y reparte las piezas/)).toBeInTheDocument();
  });

  it('abre directamente en la página citada cuando llega ?page (cita del chat)', async () => {
    renderManual(2);
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
  });

  it('la búsqueda cuenta coincidencias y resalta al saltar a una', async () => {
    renderManual();
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', {
      name: 'Buscar en el texto del manual',
    });
    await user.type(search, 'ladrón');
    // Contador global n / N (1 coincidencia, en la página 2).
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
    // El cursor salta a la página 2 y marca la coincidencia activa.
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
    expect(document.querySelector('mark[data-active-match]')).toHaveTextContent(/LADRÓN/i);
  });

  it('el toggle de confianza por línea muestra leyenda y porcentaje por línea', async () => {
    renderManual();
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: /Confianza por línea/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Confianza OCR')).toBeInTheDocument();
    // La página 1 tiene una línea con confianza 0.97 → chip «97 %».
    expect(screen.getByText('97%')).toBeInTheDocument();
  });

  it('la página poco clara muestra el aviso con reproceso puntual', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Página 2 · Poco clara' }));
    expect(await screen.findByText(/El OCR no está seguro de esta página/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Releer esta página/ })).toBeInTheDocument();
  });

  it('una página duplicada figura como «Duplicada» y avisa de que no se procesa', async () => {
    const dupPage = {
      page_number: 2,
      ocr_status: 'completed',
      text_source: 'ocr',
      text_quality: 'ok',
      dedup_status: 'reused',
      image_available: true,
      image_width: 800,
      image_height: 1200,
      ocr_confidence_mean: 0.94,
      ocr_lines: [{ text: 'PREPARACIÓN del juego.', confidence: 0.94 }],
    };
    server.use(
      http.get('/api/manuals/:manualId', ({ params }) =>
        HttpResponse.json({
          id: params.manualId,
          game_id: 'test-game-001',
          game_name: 'Catan',
          title: 'Catan',
          status: 'active',
          visibility: 'private',
          source_type: 'pdf',
          page_count: 2,
          language: 'spa',
          chunks_indexed: 2,
          created_at: '2026-05-26T10:00:00.000Z',
          indexed_at: '2026-05-26T10:00:10.000Z',
          pages: [{ ...dupPage, page_number: 1, dedup_status: 'none' }, dupPage],
        }),
      ),
    );
    renderRoute({
      path: '/manual/$manualId',
      initialEntry: '/manual/test-manual-001?page=2',
      component: routeComponent(ManualRoute),
      validateSearch: (s) => {
        const n = Number(s.page);
        return Number.isInteger(n) && n > 0 ? { page: n } : {};
      },
      stubs: { '/history': 'Historial stub', '/home': 'Home stub', '/game/$gameId': 'Juego stub' },
    });
    // Cabecera: contador de duplicadas.
    expect(await screen.findByText(/1 duplicada/)).toBeInTheDocument();
    // Carril: la página 2 figura como duplicada.
    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    expect(within(rail).getByRole('button', { name: 'Página 2 · Duplicada' })).toBeInTheDocument();
    // Aviso en el visor con el mensaje acordado.
    expect(screen.getByText('Página duplicada')).toBeInTheDocument();
    expect(
      screen.getByText(/Como no aporta nada nuevo, no se vuelve a leer ni cuenta para la explicación/),
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
          dedup_status: 'none',
          image_available: true,
          image_width: 800,
          image_height: 1200,
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
          source_type: 'pdf',
          page_count: 1,
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
              dedup_status: 'none',
              image_available: true,
              image_width: 800,
              image_height: 1200,
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
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const confirm = await screen.findByRole('dialog', { name: '¿Guardar los cambios?' });
    expect(confirm).toHaveTextContent(/Sustituirá lo leído en la página 1/);
    await user.click(within(confirm).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Editada a mano')).toBeInTheDocument();
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

  it('cambiar de página con Anterior/Siguiente sale del modo edición', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar texto' }));
    expect(
      await screen.findByRole('textbox', { name: 'Texto de la página 1' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));

    // La página 1 vuelve en modo lectura, no con el editor abierto.
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
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const confirm = await screen.findByRole('dialog', { name: '¿Guardar los cambios?' });
    await user.click(within(confirm).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El manual se está procesando')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto de la página 1' })).toBeInTheDocument();
  });
});

describe('/manual/$manualId · acciones de cabecera', () => {
  it('abre la imagen de la página activa desde Acciones', async () => {
    renderManual(2);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Acciones' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ver imagen' }));

    const dialog = await screen.findByRole('dialog', { name: 'Imagen de la página' });
    expect(dialog).toHaveTextContent('Página 2 / 2');
    expect(within(dialog).getByRole('img', { name: 'Página 2 de Catan' })).toHaveAttribute(
      'src',
      '/api/manuals/test-manual-001/pages/2/image',
    );
  });

  it('reprocesar pide confirmación y lanza el POST al confirmar', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Acciones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Reprocesar todo/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Reprocesar manual' });
    await user.click(within(dialog).getByRole('button', { name: 'Reprocesar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('eliminar manual confirma, borra y navega al historial', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Acciones' }));
    await user.click(await screen.findByRole('menuitem', { name: /Eliminar manual/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar manual' });
    await user.click(within(dialog).getByRole('button', { name: /Eliminar manual/ }));
    expect(await screen.findByText('Historial stub')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderManual();
    await screen.findByText(/Coloca el tablero y reparte las piezas/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
