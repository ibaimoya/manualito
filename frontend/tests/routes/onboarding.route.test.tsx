import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import type { RouterContext } from '@/app/router-context';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route as PublicRoute } from '@/routes/_public';
import { Route as WelcomeRoute } from '@/routes/_public.onboarding';
import { Route as LoginRoute } from '@/routes/_public.login';
import { Route as RegisterRoute } from '@/routes/_public.register';
import { Route as ForgotRoute } from '@/routes/_public.forgot';
import { storage } from '@/shared/lib/storage';
import { entryViewTransition } from '@/features/auth/entry-transition';
import bookStyles from '@/features/onboarding/welcome-book.module.css';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderEntry(initial = '/onboarding', registerReady?: Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRouteWithContext<RouterContext>()({
    component: Outlet,
    beforeLoad: () => ({ user: null }),
  });
  // Copiar las opciones desacopla los tipos del árbol de prueba y los del guard real.
  const publicRoute = createRoute({
    getParentRoute: () => root,
    id: '_public',
    beforeLoad: (options) => PublicRoute.options.beforeLoad?.({ ...options }),
    component: PublicRoute.options.component,
  });
  const welcome = createRoute({
    getParentRoute: () => publicRoute,
    path: '/onboarding',
    beforeLoad: (options) => WelcomeRoute.options.beforeLoad?.({ ...options }),
    component: WelcomeRoute.options.component,
  });
  const login = createRoute({
    getParentRoute: () => publicRoute,
    path: '/login',
    component: LoginRoute.options.component,
    validateSearch: LoginRoute.options.validateSearch,
  });
  const register = createRoute({
    getParentRoute: () => publicRoute,
    path: '/register',
    beforeLoad: () => registerReady,
    component: RegisterRoute.options.component,
  });
  const forgot = createRoute({
    getParentRoute: () => publicRoute,
    path: '/forgot',
    component: ForgotRoute.options.component,
  });
  const history = createMemoryHistory({ initialEntries: [initial] });
  const router = createRouter({
    routeTree: root.addChildren([publicRoute.addChildren([welcome, login, register, forgot])]),
    context: { queryClient },
    history,
    defaultViewTransition: entryViewTransition,
  });
  const view = render(
    <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>,
  );
  return { ...view, router, history };
}

describe('navegación de bienvenida y acceso', () => {
  it.each([false, true])(
    'respeta movimiento reducido=%s al cambiar de pantalla',
    async (reduced) => {
      // jsdom no dibuja capturas. La actualización real del DOM usa la frontera del navegador.
      vi.stubGlobal('CSS', { supports: () => true });
      const matchMedia = window.matchMedia;
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...matchMedia(query),
        matches: query === '(prefers-reduced-motion: reduce)' && reduced,
      }));
      const transition = vi.spyOn(document, 'startViewTransition');
      const user = userEvent.setup();
      renderEntry();
      await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
      expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeVisible();
      if (reduced) expect(transition).not.toHaveBeenCalled();
      else expect(transition).toHaveBeenCalledWith(expect.objectContaining({ types: ['entry'] }));
    },
  );

  it('permite abrir la bienvenida aunque ya se haya visto', async () => {
    storage.markOnboardingSeen();
    renderEntry();
    expect(await screen.findByRole('heading', { name: 'Que comience la partida.' })).toBeVisible();
  });

  it('conserva cabecera y libro al ir a registro y volver con el historial', async () => {
    const user = userEvent.setup();
    const { history, container } = renderEntry();
    const brand = await screen.findByRole('link', { name: 'Manualito, ir a la web' });
    const book = container.querySelector(`.${bookStyles.stage}`);
    expect(book).not.toBeNull();
    screen.getByRole('button', { name: 'Crear cuenta' }).focus();
    await user.keyboard(' ');
    const register = await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    await waitFor(() => expect(register).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Manualito, ir a la web' })).toBe(brand);
    expect(container.querySelector(`.${bookStyles.stage}`)).toBe(book);
    expect(storage.isOnboardingSeen()).toBe(true);
    act(() => history.back());
    const welcome = await screen.findByRole('heading', { name: 'Que comience la partida.' });
    await waitFor(() => expect(welcome).toHaveFocus());
    expect(container.querySelector(`.${bookStyles.stage}`)).toBe(book);
    act(() => history.forward());
    expect(await screen.findByRole('heading', { name: 'Crea tu cuenta' })).toBeVisible();
  });

  it('permite volver con teclado desde una entrada directa en acceso', async () => {
    const user = userEvent.setup();
    renderEntry('/login');
    const back = await screen.findByRole('link', { name: 'Volver a la bienvenida' });
    back.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: 'Que comience la partida.' })).toBeVisible();
  });

  it('respeta la última elección aunque el primer destino siga cargando', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { router } = renderEntry('/onboarding', ready);
    await user.click(await screen.findByRole('button', { name: 'Crear cuenta' }));
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    const login = await screen.findByRole('heading', { name: 'Hola de nuevo' });
    await waitFor(() => expect(login).toHaveFocus());
    await act(async () => release());
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Crea tu cuenta' })).not.toBeInTheDocument();
    const email = screen.getByRole('textbox');
    await user.type(email, 'qa@example.com');
    expect(email).toHaveValue('qa@example.com');
  });

  it('lleva el foco al formulario cuando termina de cargar', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderEntry('/onboarding', ready);
    await user.click(await screen.findByRole('button', { name: 'Crear cuenta' }));
    await act(async () => release());
    const register = await screen.findByRole('heading', { name: 'Crea tu cuenta' });
    await waitFor(() => expect(register).toHaveFocus());
  });

  it('conserva los datos y el foco al cambiar tema y consultar privacidad', async () => {
    const user = userEvent.setup();
    renderEntry('/register');
    await user.type(await screen.findByLabelText('Email'), 'qa@example.com');
    await user.click(screen.getByRole('button', { name: 'Usar modo oscuro' }));
    expect(screen.getByRole('button', { name: 'Usar modo claro' })).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('qa@example.com');
    const consent = screen.getByRole('checkbox');
    const privacy = within(consent.closest('form')!).getByRole('button', {
      name: 'Política de privacidad',
    });
    await user.click(privacy);
    expect(await screen.findByRole('dialog', { name: 'Política de privacidad' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(privacy).toHaveFocus();
    expect(consent).not.toBeChecked();
    expect(screen.getByLabelText('Email')).toHaveValue('qa@example.com');
  });
});
