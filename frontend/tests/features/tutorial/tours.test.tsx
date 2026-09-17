// Los recorridos usan Driver y pantallas reales. MSW controla los datos y permisos de la API.
import '@tests/features/tutorial/jsdom-visibility';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FC } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import { Sidebar } from '@/app/Sidebar';
import { tutorial } from '@/features/tutorial/controller';
import { TOURS } from '@/features/tutorial/tours';
import { Route as CaptureRoute } from '@/routes/_app.capture.source';
import { Route as ChatRoute } from '@/routes/_app.chat.$gameId';
import { Route as ConversationsRoute } from '@/routes/_app.conversations.$gameId';
import { Route as ExploreRoute } from '@/routes/_app.explore';
import { Route as GameRoute } from '@/routes/_app.game.$gameId';
import { Route as HistoryRoute } from '@/routes/_app.history';
import { Route as HomeRoute } from '@/routes/_app.home';
import { Route as ManualRoute } from '@/routes/_app.manual.$manualId';
import { Route as ProcessingRoute } from '@/routes/_app.processing.$manualId';
import { Route as ProfileRoute } from '@/routes/_app.profile';
import { Route as SecurityRoute } from '@/routes/_app.security';
import { Route as SettingsRoute } from '@/routes/_app.settings';
import {
  manualDetailWithPages,
  SAMPLE_GAME_DETAIL,
  SAMPLE_MANUAL_SUMMARY,
} from '@tests/_helpers/mswHandlers';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  tutorial.reset();
});
afterAll(() => server.close());

const STUBS = {
  '/home': 'Home stub',
  '/history': 'Biblioteca stub',
  '/explore': 'Explorar stub',
  '/capture/source': 'Captura stub',
  '/game/$gameId': 'Juego stub',
  '/chat/$gameId': 'Chat stub',
  '/conversations/$gameId': 'Conversaciones stub',
  '/manual/$manualId': 'Manual stub',
  '/processing/$manualId': 'Procesando stub',
  '/settings': 'Ajustes stub',
  '/profile': 'Perfil stub',
  '/security': 'Cuenta stub',
  '/privacy': 'Privacidad stub',
  '/about': 'Ayuda stub',
  '/login': 'Login stub',
};

type Stubs = Record<string, string>;

function mount(
  path: string,
  initialEntry: string,
  route: unknown,
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>,
) {
  const stubs: Stubs = { ...STUBS };
  delete stubs[path];
  return renderRoute({
    path,
    initialEntry,
    component: routeComponent(route) as FC,
    stubs,
    ...(validateSearch ? { validateSearch } : {}),
  });
}

async function explainScreen(user: ReturnType<typeof userEvent.setup>) {
  const [trigger] = screen.getAllByRole('button', { name: 'Ayuda' });
  await user.click(trigger!);
  const menu = await screen.findByRole('menu', { name: 'Ayuda' });
  await user.click(within(menu).getByRole('menuitem', { name: /Explicar esta pantalla/ }));
}

async function walk(user: ReturnType<typeof userEvent.setup>, titles: readonly string[]) {
  for (const [index, title] of titles.entries()) {
    const dialog = await screen.findByRole('dialog', { name: title });
    expect(within(dialog).getByText(`${index + 1} de ${titles.length}`)).toBeInTheDocument();
    const views: Record<string, string> = {
      Texto: 'text',
      Original: 'original',
      Comparar: 'compare',
    };
    if (views[title])
      expect(document.querySelector('[data-view]')).toHaveAttribute('data-view', views[title]);
    const last = index === titles.length - 1;
    await user.click(within(dialog).getByRole('button', { name: last ? 'Terminar' : 'Siguiente' }));
  }
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(document.body).not.toHaveClass('driver-active');
}

describe('definiciones', () => {
  it('cada paso tiene título y descripción en los dos idiomas', () => {
    for (const spec of Object.values(TOURS)) {
      for (const lng of ['es', 'en']) {
        for (const step of spec.steps) {
          expect(i18n.exists(step.title, { ns: 'tutorial', lng }), `${lng} ${step.title}`).toBe(
            true,
          );
          expect(i18n.exists(step.description, { ns: 'tutorial', lng })).toBe(true);
        }
      }
      expect(spec.steps.length).toBeGreaterThan(0);
      expect(spec.steps.length).toBeLessThanOrEqual(8);
    }
  });

  it('los textos no usan punto y coma, raya ni punto medio', () => {
    for (const lng of ['es', 'en']) {
      const bundle = JSON.stringify(i18n.getResourceBundle(lng, 'tutorial'));
      expect(bundle).not.toMatch(/[;\u2014·]/);
    }
  });
});

describe('recorridos por pantalla', () => {
  it('Inicio incluye las sugerencias disponibles', async () => {
    const user = userEvent.setup();
    const Home = routeComponent(HomeRoute);
    const stubs = { ...STUBS };
    delete (stubs as Stubs)['/home'];
    renderRoute({
      path: '/home',
      initialEntry: '/home',
      component: () => (
        <>
          <Sidebar pathname="/home" />
          <Home />
        </>
      ),
      stubs,
    });
    await screen.findByText('Carcassonne');
    tutorial.start('welcome');
    await walk(user, [
      'Inicio',
      'Sugerencias',
      'Biblioteca',
      'Explorar',
      'Añade un manual',
      'Ayuda',
    ]);
  });

  it('Explorar. buscador, pistas y sugerencias reales', async () => {
    const user = userEvent.setup();
    mount('/explore', '/explore', ExploreRoute);
    await screen.findByText('Carcassonne');
    await explainScreen(user);
    await walk(user, ['Buscador', 'Qué puedes hacer', 'Sugerencias']);
  });

  it('Biblioteca vacía. solo pestañas y estado vacío', async () => {
    const user = userEvent.setup();
    mount('/history', '/history', HistoryRoute);
    await screen.findByRole('heading', { name: 'Aún no sigues ningún juego' });
    await explainScreen(user);
    await walk(user, ['Juegos', 'Biblioteca vacía', 'Manuales', 'Búsqueda', 'Tus manuales']);
  });

  it('Biblioteca con manuales. pestañas, búsqueda y tarjeta existente', async () => {
    const user = userEvent.setup();
    mount('/history', '/history', HistoryRoute);
    await screen.findByRole('heading', { name: 'Aún no sigues ningún juego' });
    await user.click(screen.getByRole('radio', { name: /Manuales/ }));
    await screen.findByRole('link', { name: 'Abrir Catan' });
    await explainScreen(user);
    await walk(user, ['Manuales', 'Búsqueda', 'Tus manuales', 'Juegos', 'Biblioteca vacía']);
  });

  it.each([
    ['Juegos', 'Manuales', ['Biblioteca vacía', 'Manuales']],
    ['Manuales', 'Juegos', ['Búsqueda', 'Tus manuales', 'Juegos']],
  ] as const)('Biblioteca conserva %s al retroceder y cerrar', async (initial, other, steps) => {
    const user = userEvent.setup();
    mount('/history', '/history', HistoryRoute);
    await screen.findByRole('heading', { name: 'Aún no sigues ningún juego' });
    const initialTab = screen.getByRole('radio', { name: new RegExp(initial) });
    const otherTab = screen.getByRole('radio', { name: new RegExp(other) });
    await user.click(initialTab);
    await explainScreen(user);
    await screen.findByRole('dialog', { name: initial });
    for (const title of steps) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByRole('dialog', { name: title });
    }
    expect(otherTab).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByRole('dialog', { name: steps.at(-2) });
    expect(initialTab).toBeChecked();
    await user.click(await screen.findByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('dialog', { name: other });
    expect(otherTab).toBeChecked();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(initialTab).toBeChecked();
  });

  it('un filtro sin resultados conserva la búsqueda y omite tarjetas inexistentes', async () => {
    const user = userEvent.setup();
    mount('/history', '/history', HistoryRoute);
    await screen.findByRole('heading', { name: 'Aún no sigues ningún juego' });
    await user.click(screen.getByRole('radio', { name: /Manuales/ }));
    await user.type(screen.getByRole('searchbox'), 'inexistente');
    await explainScreen(user);
    await walk(user, ['Manuales', 'Búsqueda', 'Juegos', 'Biblioteca vacía']);
    expect(screen.getByRole('searchbox')).toHaveValue('inexistente');
  });

  it('Ficha del juego. explicación, acciones, manuales, conversaciones y pregunta', async () => {
    const user = userEvent.setup();
    mount('/game/$gameId', '/game/test-game-001', GameRoute);
    await screen.findByText('Catan va de construir y comerciar.');
    await explainScreen(user);
    await walk(user, [
      'Explicación',
      'Seguir el juego',
      'Valorar el juego',
      'Manuales',
      'Conversaciones',
      'Pregunta',
    ]);
  });

  it('Ficha sin manuales. sin conversaciones ni pregunta', async () => {
    server.use(
      http.get('/api/games/:gameId', () =>
        HttpResponse.json({ ...SAMPLE_GAME_DETAIL, manuals: [], conversations_count: 0 }),
      ),
    );
    const user = userEvent.setup();
    mount('/game/$gameId', '/game/test-game-001', GameRoute);
    await screen.findByRole('heading', { name: 'Aún no hay manuales' });
    await explainScreen(user);
    await walk(user, ['Explicación', 'Seguir el juego', 'Valorar el juego', 'Manuales']);
  });

  it('Añadir manual. juego, archivos, visibilidad vigente y envío', async () => {
    const user = userEvent.setup();
    mount('/capture/source', '/capture/source', CaptureRoute, (search) => ({
      gameId: typeof search.gameId === 'string' ? search.gameId : undefined,
    }));
    await screen.findByRole('combobox', { name: 'Buscar juego' });
    await explainScreen(user);
    await walk(user, ['Elige el juego', 'Archivos', 'Compartir', 'Con tu nombre', 'Procesar']);
  });

  it('Procesamiento en curso. estado, progreso y aviso de archivos', async () => {
    server.use(
      http.get('/api/manuals/:manualId/processing', () =>
        HttpResponse.json({
          manual_id: 'test-manual-001',
          status: 'indexing',
          page_count: 3,
          completed_pages: 1,
          failed_pages: 0,
          pages: [],
        }),
      ),
    );
    const user = userEvent.setup();
    mount('/processing/$manualId', '/processing/test-manual-001', ProcessingRoute, (search) => ({
      name: typeof search.name === 'string' ? search.name : undefined,
    }));
    await screen.findByText('1/3 páginas');
    await explainScreen(user);
    await walk(user, ['Leyendo el manual', 'Progreso', 'Tus archivos']);
  });

  it('Procesamiento fallido. solo las acciones reales', async () => {
    server.use(
      http.get('/api/manuals/:manualId/processing', () =>
        HttpResponse.json({
          manual_id: 'test-manual-001',
          status: 'failed',
          page_count: 3,
          completed_pages: 0,
          failed_pages: 3,
          pages: [],
        }),
      ),
    );
    const user = userEvent.setup();
    mount('/processing/$manualId', '/processing/test-manual-001', ProcessingRoute, (search) => ({
      name: typeof search.name === 'string' ? search.name : undefined,
    }));
    await screen.findByRole('link', { name: 'Subir otro manual' });
    await explainScreen(user);
    await walk(user, ['Si algo falla']);
  });

  const manualSearch = (search: Record<string, unknown>) => {
    const page = Number(search.page);
    return Number.isInteger(page) && page > 0 ? { page } : {};
  };

  it('Visor de un manual propio. incluye la edición', async () => {
    server.use(manualDetailWithPages());
    const user = userEvent.setup();
    mount('/manual/$manualId', '/manual/test-manual-001', ManualRoute, manualSearch);
    await screen.findByTestId('manual-workspace');
    await explainScreen(user);
    await walk(user, [
      'Páginas',
      'Buscar en el texto',
      'Texto',
      'Editar el texto',
      'Original',
      'Comparar',
      'Gestionar',
    ]);
  });

  it('El lector recorre el tutorial sin controles de gestión', async () => {
    server.use(
      http.get('/api/manuals/:manualId', ({ params }) =>
        HttpResponse.json({
          ...SAMPLE_MANUAL_SUMMARY,
          id: params.manualId,
          visibility: 'shared',
          is_own: false,
          pages: [
            {
              page_number: 1,
              ocr_status: 'completed',
              text_source: 'ocr',
              text_quality: 'ok',
              dedup_status: 'none',
              image_available: true,
              image_width: 800,
              image_height: 1200,
              ocr_confidence_mean: 0.9,
              ocr_lines: [{ text: 'Reglas', confidence: 0.9 }],
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    mount('/manual/$manualId', '/manual/test-manual-001', ManualRoute, manualSearch);
    await screen.findByTestId('manual-workspace');
    expect(screen.queryByRole('button', { name: 'Renombrar manual' })).not.toBeInTheDocument();
    await explainScreen(user);
    await walk(user, ['Páginas', 'Buscar en el texto', 'Texto', 'Original', 'Comparar']);
  });

  const chatSearch = (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    c: typeof search.c === 'string' ? search.c : undefined,
  });

  it('Chat nuevo. preguntas de arranque y redacción', async () => {
    const user = userEvent.setup();
    mount('/chat/$gameId', '/chat/test-game-001', ChatRoute, chatSearch);
    await screen.findByRole('button', { name: '¿Quién empieza?' });
    await explainScreen(user);
    await walk(user, ['Preguntas para empezar', 'Escribe tu pregunta']);
  });

  it('Chat con historial. respuestas, redacción y nueva conversación', async () => {
    const user = userEvent.setup();
    mount('/chat/$gameId', '/chat/test-game-001?c=conv-001', ChatRoute, chatSearch);
    await screen.findByText('Cada jugador recibe dos asentamientos y dos carreteras.');
    await explainScreen(user);
    await walk(user, ['Respuestas', 'Escribe tu pregunta', 'Nueva conversación']);
  });

  it('Conversaciones. cabecera, filtro, lista, opciones y nueva', async () => {
    const user = userEvent.setup();
    mount('/conversations/$gameId', '/conversations/test-game-001', ConversationsRoute);
    await screen.findByText('Dudas de preparación');
    await explainScreen(user);
    await walk(user, ['Tus conversaciones', 'Filtrar', 'Lista', 'Opciones', 'Nueva conversación']);
  });

  it('Ajustes. cuenta, apariencia, idioma y datos', async () => {
    const user = userEvent.setup();
    mount('/settings', '/settings', SettingsRoute);
    await screen.findByRole('heading', { name: 'Ajustes' });
    await explainScreen(user);
    await walk(user, ['Cuenta', 'Tema', 'Color de acento', 'Idioma', 'Privacidad y datos']);
  });

  it('Perfil. identidad, acciones y actividad', async () => {
    const user = userEvent.setup();
    mount('/profile', '/profile', ProfileRoute);
    await screen.findByText('En números');
    await explainScreen(user);
    await walk(user, ['Tu perfil', 'Acciones', 'Tu actividad']);
  });

  it('Cuenta y seguridad. último acceso, contraseña y eliminación', async () => {
    const user = userEvent.setup();
    mount('/security', '/security', SecurityRoute);
    await screen.findByRole('heading', { name: 'Cambiar contraseña' });
    await explainScreen(user);
    await walk(user, ['Último acceso', 'Cambiar contraseña', 'Eliminar cuenta']);
  });

  it('Biblioteca pedida antes de cargar. espera a que la lista se decida y cuenta todos los pasos', async () => {
    const user = userEvent.setup();
    mount('/history', '/history', HistoryRoute);
    tutorial.start('library');
    const first = await screen.findByRole('dialog', { name: 'Juegos' });
    expect(within(first).getByText('1 de 5')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aún no sigues ningún juego' })).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByRole('dialog', { name: 'Biblioteca vacía' })).toBeInTheDocument();
  });

  it('Explorar pedido antes de cargar. espera a las sugerencias y cuenta todos los pasos', async () => {
    mount('/explore', '/explore', ExploreRoute);
    tutorial.start('explore');
    const first = await screen.findByRole('dialog', { name: 'Buscador' });
    expect(within(first).getByText('1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Carcassonne')).toBeInTheDocument();
  });

  it('el recorrido no ejecuta acciones. el objetivo queda sin interacción', async () => {
    const user = userEvent.setup();
    mount('/settings', '/settings', SettingsRoute);
    await screen.findByRole('heading', { name: 'Ajustes' });
    await explainScreen(user);
    await screen.findByRole('dialog', { name: 'Cuenta' });
    expect(screen.getByRole('link', { name: /Editar perfil/ })).toHaveClass(
      'driver-active-element',
      'driver-no-interaction',
    );
  });
});
