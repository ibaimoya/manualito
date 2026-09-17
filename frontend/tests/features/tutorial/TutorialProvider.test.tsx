// Se monta el shell y las pantallas probadas. MSW aísla la API y las rutas no visitadas usan componentes mínimos.
import '@tests/features/tutorial/jsdom-visibility';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type FC } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppToaster } from '@/app/AppToaster';
import i18n from '@/app/i18n';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import { tutorial } from '@/features/tutorial/controller';
import { Route as AppRoute } from '@/routes/_app';
import { Route as AboutRoute } from '@/routes/_app.about';
import { Route as ExploreRoute } from '@/routes/_app.explore';
import { Route as HomeRoute } from '@/routes/_app.home';
import type { AuthUser } from '@/shared/api/auth';
import { storage } from '@/shared/lib/storage';
import { renderRoute, routeComponent, TEST_USER } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

const AppLayout = (AppRoute as unknown as { options: { component: FC } }).options.component;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  tutorial.reset();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function mountShell(
  path: string,
  { user = TEST_USER, strict = false }: { user?: AuthUser | null; strict?: boolean } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(AUTH_ME_KEY, user ? { user, csrf_token: 'csrf-test-token' } : null);
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({ getParentRoute: () => root, id: 'app', component: AppLayout });
  const page = (childPath: string, component: FC) =>
    createRoute({ getParentRoute: () => app, path: childPath, component });
  const stub = (childPath: string, label: string) => page(childPath, () => <div>{label}</div>);
  const router = createRouter({
    routeTree: root.addChildren([
      app.addChildren([
        page('/home', routeComponent(HomeRoute)),
        page('/explore', routeComponent(ExploreRoute)),
        page('/about', routeComponent(AboutRoute)),
        stub('/history', 'Biblioteca stub'),
        stub('/capture/source', 'Captura stub'),
        stub('/settings', 'Ajustes stub'),
        stub('/privacy', 'Privacidad stub'),
        stub('/game/$gameId', 'Juego stub'),
      ]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const tree = (
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
          <AppToaster />
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { qc, router, ...view };
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
const findWelcome = () => screen.findByRole('dialog', { name: 'Inicio' });
const helpButtons = () => screen.getAllByRole('button', { name: 'Ayuda' });

async function openHelpMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = helpButtons().find((button) => button.getAttribute('aria-haspopup') === 'menu');
  await user.click(trigger!);
  return { trigger: trigger!, menu: await screen.findByRole('menu', { name: 'Ayuda' }) };
}

describe('TutorialProvider. arranque automático', () => {
  it('abre el tutorial al llegar a Inicio con sesión y lo marca como visto', async () => {
    mountShell('/home');
    const dialog = await findWelcome();
    expect(within(dialog).getByText('1 de 6')).toBeInTheDocument();
    await waitFor(() => expect(storage.isTutorialSeen(TEST_USER.id)).toBe(true));
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
  });

  it('respeta un enlace directo y pospone el arranque hasta visitar Inicio', async () => {
    const { router } = mountShell('/explore');
    await screen.findByRole('heading', { name: 'Explorar juegos' });
    await settle();
    noDialog();
    expect(storage.isTutorialSeen(TEST_USER.id)).toBe(false);

    await act(() => router.navigate({ to: '/home' }));
    expect(await findWelcome()).toBeInTheDocument();
  });

  it('no arranca sin sesión', async () => {
    mountShell('/home', { user: null });
    await settle();
    noDialog();
  });

  it('no se repite para una cuenta que ya lo vio, pero sí para otra cuenta', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const first = mountShell('/home');
    await screen.findByRole('heading', { name: /Hola/ });
    await settle();
    noDialog();
    first.unmount();
    tutorial.reset();

    mountShell('/home', { user: { ...TEST_USER, id: 'user-002' } });
    expect(await findWelcome()).toBeInTheDocument();
  });

  it('tras cerrarlo no vuelve a abrirse al recargar ni al volver a Inicio', async () => {
    const user = userEvent.setup();
    const { router, unmount } = mountShell('/home');
    await findWelcome();
    await waitFor(() => expect(storage.isTutorialSeen(TEST_USER.id)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(noDialog);

    await act(() => router.navigate({ to: '/explore' }));
    await act(() => router.navigate({ to: '/home' }));
    await settle();
    noDialog();

    unmount();
    tutorial.reset();
    mountShell('/home');
    await screen.findByRole('heading', { name: /Hola/ });
    await settle();
    noDialog();
  });

  it('con el almacenamiento bloqueado se muestra una vez por sesión sin bloquear la app', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    const user = userEvent.setup();
    const { router } = mountShell('/home');
    await findWelcome();
    await user.keyboard('{Escape}');
    await waitFor(noDialog);

    await act(() => router.navigate({ to: '/explore' }));
    await act(() => router.navigate({ to: '/home' }));
    await settle();
    noDialog();
    expect(screen.getByRole('heading', { name: /Hola/ })).toBeInTheDocument();
  });

  it('en StrictMode solo hay un globo y un velo', async () => {
    mountShell('/home', { strict: true });
    await findWelcome();
    await settle();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    expect(document.querySelectorAll('.driver-overlay')).toHaveLength(1);
  });

  it('se cancela al navegar, sin avisar de objetivos perdidos', async () => {
    const { router } = mountShell('/home');
    await findWelcome();
    await act(() => router.navigate({ to: '/explore' }));
    await waitFor(noDialog);
    expect(document.body).not.toHaveClass('driver-active');
    await settle();
    const unavailable = i18n.t('unavailable.title', { ns: 'tutorial' });
    expect(screen.queryByText(unavailable)).not.toBeInTheDocument();
  });

  it('se cancela al cambiar de cuenta y al cerrar sesión', async () => {
    const { qc } = mountShell('/home');
    await findWelcome();
    await waitFor(() => expect(storage.isTutorialSeen(TEST_USER.id)).toBe(true));

    act(() => {
      qc.setQueryData(AUTH_ME_KEY, { user: { ...TEST_USER, id: 'user-003' }, csrf_token: 'x' });
    });
    await waitFor(() => expect(storage.isTutorialSeen('user-003')).toBe(true));
    expect(await findWelcome()).toBeInTheDocument();

    act(() => {
      qc.setQueryData(AUTH_ME_KEY, null);
    });
    await waitFor(noDialog);
    expect(document.body).not.toHaveClass('driver-active');
  });
});

describe('TutorialProvider. menú de ayuda', () => {
  it('abre el tutorial desde la ayuda desplegada y devuelve el foco a su cabecera', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const user = userEvent.setup();
    mountShell('/home');
    await screen.findByRole('heading', { name: /Hola/ });
    const trigger = helpButtons().find((button) => !button.hasAttribute('aria-haspopup'))!;
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Explicar esta pantalla' }));
    await findWelcome();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Escape}');
    await waitFor(noDialog);
    expect(trigger).toHaveFocus();
  });

  it('Explicar esta pantalla lo reabre aunque ya se haya visto y devuelve el foco a Ayuda', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const user = userEvent.setup();
    mountShell('/home');
    await screen.findByRole('heading', { name: /Hola/ });
    const { trigger, menu } = await openHelpMenu(user);
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);

    await user.click(within(menu).getByRole('menuitem', { name: 'Explicar esta pantalla' }));
    const dialog = await findWelcome();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');
    await waitFor(noDialog);
    expect(trigger).toHaveFocus();
  });

  it('al terminar el tutorial el botón de Ayuda conserva sus atributos de menú', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const user = userEvent.setup();
    mountShell('/home');
    await screen.findByRole('heading', { name: /Hola/ });
    const helpTargets = [...document.querySelectorAll('[data-tour="nav-help"]')];
    expect(helpTargets.length).toBeGreaterThan(0);
    const originalAttributes = helpTargets.map((target) => ({
      target,
      popup: target.getAttribute('aria-haspopup'),
      controls: target.getAttribute('aria-controls'),
    }));
    const { menu } = await openHelpMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Explicar esta pantalla' }));
    await findWelcome();
    for (const title of ['Sugerencias', 'Biblioteca', 'Explorar', 'Añade un manual', 'Ayuda']) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByRole('dialog', { name: title });
    }
    const highlighted = document.querySelector('.driver-active-element');
    expect(highlighted).toHaveAttribute('data-tour', 'nav-help');
    expect(highlighted).toHaveAttribute('aria-haspopup', 'dialog');

    await user.click(screen.getByRole('button', { name: 'Terminar' }));
    await waitFor(noDialog);
    for (const { target, popup, controls } of originalAttributes) {
      expect(target.getAttribute('aria-haspopup')).toBe(popup);
      expect(target).toHaveAttribute('aria-expanded', 'false');
      expect(target.getAttribute('aria-controls')).toBe(controls);
    }
    expect(document.querySelector('.driver-active-element')).toBeNull();
  });

  it('Explicar esta pantalla abre el recorrido de la pantalla actual', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const user = userEvent.setup();
    mountShell('/explore');
    await screen.findByRole('heading', { name: 'Explorar juegos' });
    const { menu } = await openHelpMenu(user);

    await user.click(within(menu).getByRole('menuitem', { name: /Explicar esta pantalla/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Buscador' });
    expect(within(dialog).getByText('1 de 3')).toBeInTheDocument();
  });

  it('en la página de ayuda no ofrece explicación local', async () => {
    storage.markTutorialSeen(TEST_USER.id);
    const user = userEvent.setup();
    mountShell('/about');
    await screen.findByRole('button', { name: /Qué pasa con mis fotos/ });
    const { menu } = await openHelpMenu(user);

    const explain = within(menu).getByRole('menuitem', { name: /Explicar esta pantalla/ });
    expect(explain).toHaveAttribute('aria-disabled', 'true');
    expect(within(explain).getByText('No disponible en esta pantalla')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Preguntas frecuentes' })).toHaveAttribute(
      'href',
      '/about',
    );
  });
});

describe('TutorialProvider. sin shell', () => {
  it('las pantallas sueltas muestran el botón de ayuda pero no arrancan nada solas', async () => {
    renderRoute({
      path: '/home',
      initialEntry: '/home',
      component: routeComponent(HomeRoute),
      stubs: { '/capture/source': 'Captura stub', '/settings': 'Ajustes stub' },
    });
    await screen.findByRole('heading', { name: /Hola/ });
    expect(helpButtons().length).toBeGreaterThan(0);
    await settle();
    noDialog();
  });
});
