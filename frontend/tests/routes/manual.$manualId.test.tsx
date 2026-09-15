import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ManualRoute } from '@/routes/_app.manual.$manualId';
import type { ManualDetailResponse } from '@/shared/api/client';
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
  return mountManual(page);
}

function mountManual(page?: number) {
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

function mockSinglePageManual(
  page: Record<string, unknown>,
  manual: Partial<ManualDetailResponse> = {},
) {
  server.use(
    http.get('/api/manuals/:manualId', ({ params }) =>
      HttpResponse.json({
        id: params.manualId,
        game_id: 'test-game-001',
        game_name: 'Catan',
        title: 'Catan',
        status: 'active',
        visibility: 'private',
        anonymous: true,
        source_type: 'images',
        page_count: 1,
        language: 'spa',
        chunks_indexed: 0,
        created_at: '2026-05-26T10:00:00.000Z',
        indexed_at: null,
        is_own: true,
        ...manual,
        pages: [
          {
            page_number: 1,
            text_source: 'none',
            text_quality: null,
            dedup_status: 'none',
            image_available: true,
            image_width: 800,
            image_height: 1200,
            ocr_confidence_mean: null,
            ocr_lines: [],
            ...page,
          },
        ],
      }),
    ),
  );
}

describe('/manual/$manualId · lectura', () => {
  it('un manual inexistente ofrece volver a la biblioteca', async () => {
    server.use(http.get('/api/manuals/:manualId', () => new HttpResponse(null, { status: 404 })));
    const { container } = mountManual();
    expect(
      await screen.findByRole('heading', { name: 'Este manual no está disponible' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Ir a la biblioteca' }));
    expect(await screen.findByText('Historial stub')).toBeInTheDocument();
  });

  it('reintenta un fallo de carga y muestra las páginas recibidas', async () => {
    server.use(http.get('/api/manuals/:manualId', () => new HttpResponse(null, { status: 503 })));
    mountManual();
    expect(
      await screen.findByRole('heading', { name: 'No hemos podido abrir este manual' }),
    ).toBeInTheDocument();
    server.use(manualDetailWithPages());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('article', { name: 'Página 1 de 2' })).toBeInTheDocument();
  });

  it('distingue un manual sin páginas de un error de carga', async () => {
    mountManual();
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay páginas que mostrar' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No hemos podido abrir este manual')).not.toBeInTheDocument();
  });

  it('mantiene el texto y la página activa cuando falla una actualización', async () => {
    const { qc } = renderManual(2);
    const article = await screen.findByRole('article', { name: 'Página 2 de 2' });
    server.use(http.get('/api/manuals/:manualId', () => new HttpResponse(null, { status: 500 })));
    const queryKey = ['manuals', 'detail', 'test-manual-001'];
    await qc.invalidateQueries({ queryKey });
    await waitFor(() => expect(qc.getQueryState(queryKey)?.status).toBe('error'));
    expect(screen.getByRole('article', { name: 'Página 2 de 2' })).toBe(article);
    expect(article).toHaveTextContent('EL LADRÓN');
  });

  it('muestra el carril de páginas con su estado y el texto de la activa', async () => {
    renderManual();
    const rail = await screen.findByRole('navigation', { name: 'Páginas del manual' });
    expect(
      within(rail).getByRole('button', { name: 'Página 1 · Texto disponible' }),
    ).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Página 2 · Poco clara' })).toBeInTheDocument();
    expect(screen.getByText(/Coloca el tablero y reparte las piezas/)).toBeInTheDocument();
  });

  it('abre directamente en la página citada cuando llega ?page (cita del chat)', async () => {
    renderManual(2);
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
  });

  it('abre la primera página si la cita apunta a una página inexistente', async () => {
    renderManual(99);
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 1 de 2');
  });

  it('respeta las flechas con modificadores y conserva los atajos simples de página', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('article', { name: 'Página 1 de 2' }));
    const arrowEvents: KeyboardEvent[] = [];
    const recordArrow = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') arrowEvents.push(event);
    };
    globalThis.addEventListener('keydown', recordArrow);

    try {
      for (const modifier of ['Alt', 'Control', 'Meta', 'Shift']) {
        await user.keyboard(`{${modifier}>}{ArrowRight}{ArrowLeft}{/${modifier}}`);
        expect(screen.getByRole('article')).toHaveAccessibleName('Página 1 de 2');
      }
      expect(arrowEvents).toHaveLength(8);
      expect(arrowEvents.every((event) => !event.defaultPrevented)).toBe(true);

      await user.keyboard('{ArrowRight}');
      expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
      await user.keyboard('{ArrowLeft}');
      expect(await screen.findByRole('article')).toHaveAccessibleName('Página 1 de 2');
    } finally {
      globalThis.removeEventListener('keydown', recordArrow);
    }
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

  it('el control de confianza muestra el porcentaje accesible de cada línea', async () => {
    renderManual();
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: /Confianza por línea/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', {
        name: 'Confianza OCR de esta línea: Alta, 97 por ciento',
      }),
    ).toHaveTextContent('97%');
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.queryByRole('button', {
        name: 'Confianza OCR de esta línea: Alta, 97 por ciento',
      }),
    ).not.toBeInTheDocument();
  });

  it('explica la ausencia de confianza sin activar el modo con teclado o clic', async () => {
    renderManual();
    mockSinglePageManual({
      ocr_status: 'completed',
      text_source: 'pdf_text',
      ocr_lines: [{ text: 'Texto extraído del PDF.', confidence: null }],
    });
    const user = userEvent.setup();
    const toggle = await screen.findByRole('switch', { name: 'Confianza por línea' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');

    for (let index = 0; document.activeElement !== toggle && index < 35; index++) {
      await user.tab();
    }
    expect(toggle).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Esta página no tiene datos de confianza OCR.',
    );
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('la página poco clara muestra el aviso con reproceso puntual', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Página 2 · Poco clara' }));
    const status = await screen.findByRole('button', { name: 'Poco clara' });
    await user.hover(status);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /El OCR no está seguro de esta página/,
    );
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
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
          is_own: true,
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
    expect(await screen.findByRole('button', { name: /Una página es idéntica/ })).toHaveTextContent(
      '1',
    );
    // Carril: la página 2 figura como duplicada.
    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    expect(within(rail).getByRole('button', { name: 'Página 2 · Duplicada' })).toBeInTheDocument();
    // El estado mantiene el detalle disponible sin desplazar el documento.
    const status = screen.getByRole('button', { name: 'Duplicada' });
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.hover(status);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/no se vuelve a leer/i);
  });
});

describe('/manual/$manualId · edición de texto', () => {
  it('mantiene el manual compartido en solo lectura', async () => {
    mockSinglePageManual(
      {
        ocr_status: 'completed',
        text_source: 'ocr',
        text_quality: 'ok',
        ocr_lines: [{ text: 'Reglas compartidas.', confidence: 0.94 }],
      },
      { visibility: 'shared' },
    );
    renderRoute({
      path: '/manual/$manualId',
      initialEntry: '/manual/test-manual-001',
      component: routeComponent(ManualRoute),
      stubs: { '/history': 'Historial stub', '/game/$gameId': 'Juego stub' },
    });
    expect(await screen.findByText('Compartido · Solo lectura')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Reglas compartidas.');
  });

  it('permite escribir texto a mano si la lectura de la página falló', async () => {
    mockSinglePageManual({ ocr_status: 'failed' });
    renderRoute({
      path: '/manual/$manualId',
      initialEntry: '/manual/test-manual-001',
      component: routeComponent(ManualRoute),
      stubs: { '/history': 'Historial stub', '/home': 'Home stub', '/game/$gameId': 'Juego stub' },
    });

    const user = userEvent.setup();
    expect(await screen.findByText('No pudimos leer esta página')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(
      await screen.findByRole('textbox', { name: 'Texto de la página 1' }),
    ).toBeInTheDocument();
  });

  it('no permite editar una página que sigue procesándose', async () => {
    mockSinglePageManual({ ocr_status: 'processing' });
    renderRoute({
      path: '/manual/$manualId',
      initialEntry: '/manual/test-manual-001',
      component: routeComponent(ManualRoute),
      stubs: { '/history': 'Historial stub', '/home': 'Home stub', '/game/$gameId': 'Juego stub' },
    });

    expect(await screen.findByRole('button', { name: 'Procesando' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Confianza por línea' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

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
          is_own: true,
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
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const textarea = await screen.findByRole('textbox', { name: 'Texto de la página 1' });
    await user.clear(textarea);
    await user.type(textarea, 'PREPARACIÓN corregida a mano.');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('dialog', { name: '¿Guardar los cambios?' });
    expect(confirm).toHaveTextContent(/Sustituirá lo leído en la página 1/);
    await user.click(within(confirm).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Editada a mano' })).toBeInTheDocument();
    expect(screen.getByText('PREPARACIÓN corregida a mano.')).toBeInTheDocument();
  });

  it('cancelar la edición restaura la vista de lectura sin tocar nada', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: /Texto de la página/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Coloca el tablero y reparte las piezas/)).toBeInTheDocument();
  });

  it('explica el bloqueo de borrar durante la edición y no lo activa por teclado', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const remove = screen.getByRole('button', { name: 'Eliminar manual' });
    const search = screen.getByRole('searchbox', { name: 'Buscar en el texto del manual' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(search).toBeDisabled();

    act(() => remove.focus());
    expect(remove).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Termina de editar la página para eliminar el manual.',
    );
    await user.keyboard('{Enter} ');
    expect(screen.queryByRole('dialog', { name: 'Eliminar manual' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto de la página 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(remove).toHaveAttribute('aria-disabled', 'false');
    expect(search).toBeEnabled();
    await user.click(remove);
    expect(await screen.findByRole('dialog', { name: 'Eliminar manual' })).toBeInTheDocument();
  });

  it('impide cancelar, descartar o repetir el guardado hasta recibir la respuesta', async () => {
    const { qc, router } = renderManual();
    const user = userEvent.setup();
    const edit = await screen.findByRole('button', { name: 'Editar' });
    const detail = qc.getQueryData<ManualDetailResponse>(['manuals', 'detail', 'test-manual-001'])!;
    const draft = 'Regla corregida que se está guardando.';
    const updated: ManualDetailResponse['pages'][number] = {
      ...detail.pages[0]!,
      text_source: 'user_edit',
      ocr_confidence_mean: null,
      ocr_lines: [{ text: draft, confidence: null }],
    };
    // Solo controlamos la frontera HTTP para observar el guardado sin depender de su latencia.
    const response = Promise.withResolvers<void>();
    const requests: unknown[] = [];
    let saved = false;
    server.use(
      http.put('/api/manuals/:manualId/pages/:pageNumber/text', async ({ request }) => {
        requests.push(await request.json());
        await response.promise;
        saved = true;
        return HttpResponse.json(updated);
      }),
      http.get('/api/manuals/:manualId', () =>
        HttpResponse.json({
          ...detail,
          pages: [saved ? updated : detail.pages[0], detail.pages[1]],
        }),
      ),
    );

    try {
      await user.click(edit);
      const textarea = screen.getByRole('textbox', { name: 'Texto de la página 1' });
      const cancel = screen.getByRole('button', { name: 'Cancelar' });
      await user.clear(textarea);
      await user.type(textarea, draft);
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      const confirm = await screen.findByRole('dialog', { name: '¿Guardar los cambios?' });
      const save = within(confirm).getByRole('button', { name: 'Guardar' });
      await user.click(save);
      await waitFor(() => expect(requests).toEqual([{ text: draft }]));

      expect(save).toBeDisabled();
      expect(within(confirm).getByRole('button', { name: 'Seguir editando' })).toBeDisabled();
      expect(within(confirm).queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();
      expect(edit).toBeDisabled();
      expect(cancel).toBeDisabled();
      expect(textarea).toBeDisabled();
      await user.click(save);
      await user.keyboard('{Escape}');
      expect(screen.getByRole('dialog', { name: '¿Guardar los cambios?' })).toBe(confirm);
      expect(requests).toHaveLength(1);

      // La navegación real del router también debe proteger una petición todavía pendiente.
      act(() => {
        void router.navigate({ to: '/history' });
      });
      const discard = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
      const discardButton = within(discard).getByRole('button', { name: 'Descartar cambios' });
      expect(discardButton).toBeDisabled();
      await user.click(discardButton);
      expect(router.state.location.pathname).toBe('/manual/test-manual-001');
      expect(textarea).toHaveValue(draft);
      await user.click(within(discard).getByRole('button', { name: 'Seguir editando' }));
      expect(
        screen.queryByRole('dialog', { name: '¿Descartar los cambios?' }),
      ).not.toBeInTheDocument();

      response.resolve();
      expect(await screen.findByRole('article', { name: 'Página 1 de 2' })).toHaveTextContent(
        draft,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
      expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
      await user.click(screen.getByRole('link', { name: 'Biblioteca' }));
      expect(await screen.findByText('Historial stub')).toBeInTheDocument();
    } finally {
      response.resolve();
    }
  });

  it('cancelar con cambios permite seguir editando el borrador intacto', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const textarea = screen.getByRole('textbox', { name: 'Texto de la página 1' });
    await user.clear(textarea);
    await user.type(textarea, 'Regla corregida que todavía no he guardado.');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    const discard = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
    await user.click(within(discard).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(textarea).toHaveValue('Regla corregida que todavía no he guardado.');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('protege el borrador al cambiar de página hasta confirmar el descarte', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const textarea = screen.getByRole('textbox', { name: 'Texto de la página 1' });
    await user.type(textarea, ' Nota sin guardar.');
    const draft = (textarea as HTMLTextAreaElement).value;
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    const discard = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
    await user.click(within(discard).getByRole('button', { name: 'Seguir editando' }));
    expect(textarea).toHaveValue(draft);

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    const confirmation = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Descartar cambios' }));
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 2 de 2');
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByRole('article')).not.toHaveTextContent('Nota sin guardar.');
    expect(screen.queryByRole('textbox', { name: /Texto de la página/ })).not.toBeInTheDocument();
  });

  it('bloquea la navegación a Biblioteca y permite cancelarla o continuar sin guardar', async () => {
    const { router } = renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const textarea = screen.getByRole('textbox', { name: 'Texto de la página 1' });
    await user.type(textarea, ' Mi borrador.');
    const draft = (textarea as HTMLTextAreaElement).value;
    await user.click(screen.getByRole('link', { name: 'Biblioteca' }));
    const discard = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
    expect(router.state.location.pathname).toBe('/manual/test-manual-001');
    await user.click(within(discard).getByRole('button', { name: 'Seguir editando' }));
    expect(textarea).toHaveValue(draft);
    expect(router.state.location.pathname).toBe('/manual/test-manual-001');

    await user.click(screen.getByRole('link', { name: 'Biblioteca' }));
    const confirmation = await screen.findByRole('dialog', { name: '¿Descartar los cambios?' });
    await user.click(within(confirmation).getByRole('button', { name: 'Descartar cambios' }));
    expect(await screen.findByText('Historial stub')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/history');
  });

  it('cambiar de página sin modificar texto sale de edición sin confirmación', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    expect(
      await screen.findByRole('textbox', { name: 'Texto de la página 1' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));

    // La página 1 vuelve en modo lectura, no con el editor abierto.
    expect(screen.queryByRole('textbox', { name: /Texto de la página/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const textarea = await screen.findByRole('textbox', { name: 'Texto de la página 1' });
    await user.type(textarea, ' más texto');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    const confirm = await screen.findByRole('dialog', { name: '¿Guardar los cambios?' });
    await user.click(within(confirm).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El manual se está procesando')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Texto de la página 1' })).toBeInTheDocument();
  });
});

describe('/manual/$manualId · manual compartido por otra persona', () => {
  const MANAGEMENT_BUTTONS = [
    'Volver a leer',
    'Renombrar manual',
    'Eliminar manual',
    'Editar',
    /Releer esta página/,
    /Compartido como Anónimo/,
  ];

  function renderSharedManual(page?: number) {
    server.use(manualDetailWithPages({ is_own: false, visibility: 'shared' }));
    return mountManual(page);
  }

  it('abre en el original y solo ofrece lectura, navegación, búsqueda y zoom', async () => {
    const { container } = renderSharedManual();
    const user = userEvent.setup();
    const compare = await screen.findByRole('radio', { name: 'Comparar' });
    const views = compare.closest('[role="radiogroup"]') as HTMLElement;
    expect(within(views).getByRole('radio', { name: 'Original' })).toBeChecked();
    expect(screen.getByText('Compartido · Solo lectura')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Página 1 de Catan' })).toHaveAttribute(
      'src',
      '/api/manuals/test-manual-001/pages/1/image',
    );
    expect(screen.getByRole('group', { name: 'Controles de la imagen' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar en el texto del manual' })).toBeEnabled();
    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    expect(within(rail).getByRole('button', { name: 'Página 2' })).toBeInTheDocument();
    expect(within(rail).getAllByRole('button')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Estados de las páginas' }),
    ).not.toBeInTheDocument();
    for (const name of MANAGEMENT_BUTTONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('switch', { name: /Confianza por línea/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByRole('img', { name: 'Página 2 de Catan' })).toBeInTheDocument();
    await user.click(within(views).getByRole('radio', { name: 'Texto' }));
    const article = screen.getByRole('article');
    expect(article).toHaveAccessibleName('Página 2 de 2');
    expect(article).toHaveTextContent('EL LADRÓN');
    expect(screen.queryByRole('button', { name: 'Poco clara' })).not.toBeInTheDocument();
    expect(screen.queryByText(/caracteres/)).not.toBeInTheDocument();
    for (const name of MANAGEMENT_BUTTONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('switch', { name: /Confianza por línea/ })).not.toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar en el texto del manual' }),
      'tablero',
    );
    expect(await screen.findByText('1 / 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
    expect(await screen.findByRole('article')).toHaveAccessibleName('Página 1 de 2');
    await user.click(within(views).getByRole('radio', { name: 'Original' }));
    await user.click(screen.getByRole('button', { name: 'Ampliar original' }));
    expect(await screen.findByRole('dialog', { name: 'Imagen de la página' })).toBeInTheDocument();
  });

  it('respeta la página citada y cae al texto cuando esa página no tiene imagen', async () => {
    server.use(
      http.get('/api/manuals/:manualId', ({ params }) =>
        HttpResponse.json({
          id: params.manualId,
          game_id: 'test-game-001',
          game_name: 'Catan',
          title: 'Reglas de Ana',
          status: 'active',
          visibility: 'shared',
          anonymous: false,
          source_type: 'pdf',
          page_count: 2,
          duplicate_page_count: 0,
          language: 'spa',
          chunks_indexed: 2,
          created_at: '2026-05-26T10:00:00.000Z',
          indexed_at: '2026-05-26T10:00:10.000Z',
          is_own: false,
          pages: [
            {
              page_number: 1,
              ocr_status: 'completed',
              text_source: 'pdf_text',
              text_quality: 'ok',
              dedup_status: 'none',
              image_available: true,
              image_width: 800,
              image_height: 1200,
              ocr_confidence_mean: null,
              ocr_lines: [{ text: 'Primera página.', confidence: null }],
            },
            {
              page_number: 2,
              ocr_status: 'completed',
              text_source: 'pdf_text',
              text_quality: 'ok',
              dedup_status: 'none',
              image_available: false,
              image_width: null,
              image_height: null,
              ocr_confidence_mean: null,
              ocr_lines: [{ text: 'Gana quien llegue a diez puntos.', confidence: null }],
            },
          ],
        }),
      ),
    );
    mountManual(2);
    const compare = await screen.findByRole('radio', { name: 'Comparar' });
    const views = compare.closest('[role="radiogroup"]') as HTMLElement;
    expect(within(views).getByRole('radio', { name: 'Texto' })).toBeChecked();
    expect(screen.getByRole('article')).toHaveAccessibleName('Página 2 de 2');
    expect(screen.getByRole('article')).toHaveTextContent('Gana quien llegue a diez puntos.');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Compartido con mi nombre/ }),
    ).not.toBeInTheDocument();
  });

  it('una página fallida se presenta sin texto, sin diagnóstico ni invitación a corregir', async () => {
    mockSinglePageManual(
      { ocr_status: 'failed', image_available: false, image_width: null, image_height: null },
      { is_own: false, visibility: 'shared' },
    );
    mountManual();
    expect(await screen.findByRole('article', { name: 'Página 1 de 1' })).toHaveTextContent(
      'Sin texto disponible',
    );
    const compare = screen.getByRole('radio', { name: 'Comparar' });
    const views = compare.closest('[role="radiogroup"]') as HTMLElement;
    expect(within(views).getByRole('radio', { name: 'Texto' })).toBeChecked();
    expect(screen.queryByText('No pudimos leer esta página')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reintenta/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Error de lectura' })).not.toBeInTheDocument();
    for (const name of MANAGEMENT_BUTTONS) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('quien comparte su propio manual conserva todos los controles', async () => {
    server.use(manualDetailWithPages({ visibility: 'shared' }));
    mountManual(2);
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Volver a leer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renombrar manual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar manual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compartido como Anónimo/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Confianza por línea/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Comparar' })).toBeChecked();
    expect(screen.getByRole('button', { name: /Releer esta página/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Poco clara' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estados de las páginas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2 · Poco clara' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a leer' }));
    expect(await screen.findByRole('dialog', { name: 'Reprocesar manual' })).toBeInTheDocument();
  });
});

describe('/manual/$manualId · acciones de cabecera', () => {
  it('conserva el borrador al alternar vistas y desactiva el panel oculto inmediatamente', async () => {
    renderManual();
    const user = userEvent.setup();
    const compare = await screen.findByRole('radio', { name: 'Comparar' });
    const views = compare.closest('[role="radiogroup"]') as HTMLElement;
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const textarea = screen.getByRole('textbox', { name: 'Texto de la página 1' });
    await user.clear(textarea);
    await user.type(textarea, 'Un borrador que permanece al consultar el original.');
    const textPane = screen.getByRole('region', { name: 'Texto' });
    const originalPane = screen.getByRole('region', { name: 'Original' });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(within(views).getByRole('radio', { name: 'Original' }));
      expect(textPane).toHaveAttribute('inert');
      expect(textPane).toHaveAttribute('aria-hidden', 'true');
      expect(screen.queryByRole('textbox', { name: 'Texto de la página 1' })).toBeNull();
      expect(originalPane).not.toHaveAttribute('inert');

      await user.click(within(views).getByRole('radio', { name: 'Texto' }));
      expect(screen.getByRole('textbox', { name: 'Texto de la página 1' })).toBe(textarea);
      expect(textarea).toHaveValue('Un borrador que permanece al consultar el original.');
      expect(textPane).not.toHaveAttribute('inert');
      expect(originalPane).toHaveAttribute('inert');
    }
  });

  it('ofrece Texto, Original y Comparar y amplía la página activa sin menú de acciones', async () => {
    renderManual(2);
    const user = userEvent.setup();
    const compare = await screen.findByRole('radio', { name: 'Comparar' });
    // jsdom no evalúa container queries; elegimos el grupo que ofrece Comparar.
    const views = compare.closest('[role="radiogroup"]') as HTMLElement;
    expect(views).toHaveAccessibleName('Vista del manual');
    expect(compare).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Acciones' })).not.toBeInTheDocument();
    await user.click(within(views).getByRole('radio', { name: 'Original' }));
    expect(within(views).getByRole('radio', { name: 'Original' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Ampliar original' }));

    const dialog = await screen.findByRole('dialog', { name: 'Imagen de la página' });
    expect(dialog).toHaveAccessibleDescription('Página 2 de 2 · Catan');
    expect(within(dialog).getByRole('img', { name: 'Página 2 de Catan' })).toHaveAttribute(
      'src',
      '/api/manuals/test-manual-001/pages/2/image',
    );
    // La geometría de ajuste, pan y zoom se comprueba en navegador real.
    expect(within(dialog).getByRole('button', { name: 'Página completa' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Ajustar al ancho' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Página anterior' }));
    expect(within(dialog).getByRole('img', { name: 'Página 1 de Catan' })).toHaveAttribute(
      'src',
      '/api/manuals/test-manual-001/pages/1/image',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ampliar original' })).toHaveFocus();
    await user.click(within(views).getByRole('radio', { name: 'Texto' }));
    expect(within(views).getByRole('radio', { name: 'Texto' })).toBeChecked();
    expect(screen.getByRole('article')).toHaveAccessibleName('Página 1 de 2');
  });

  it('reprocesar pide confirmación y lanza el POST al confirmar', async () => {
    const { qc } = renderManual();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Volver a leer' });
    const detail = qc.getQueryData<ManualDetailResponse>(['manuals', 'detail', 'test-manual-001'])!;
    const processedIds: string[] = [];
    const progress = {
      manual_id: detail.id,
      status: 'indexing',
      page_count: detail.pages.length,
      completed_pages: 0,
      failed_pages: 0,
      pages: [],
    };
    server.use(
      http.post('/api/manuals/:manualId/reprocess', ({ params }) => {
        processedIds.push(String(params.manualId));
        return HttpResponse.json(progress, { status: 202 });
      }),
      http.get('/api/manuals/:manualId', () =>
        HttpResponse.json({
          ...detail,
          status: processedIds.length > 0 ? 'indexing' : detail.status,
        }),
      ),
      http.get('/api/manuals/:manualId/processing', () => HttpResponse.json(progress)),
    );
    await user.click(screen.getByRole('button', { name: 'Volver a leer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reprocesar manual' });
    expect(processedIds).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Reprocesar' }));
    expect(await screen.findByText('Reprocesando el manual…')).toBeInTheDocument();
    expect(processedIds).toEqual(['test-manual-001']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('eliminar manual confirma, borra y navega al historial', async () => {
    renderManual();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Eliminar manual' }));
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
