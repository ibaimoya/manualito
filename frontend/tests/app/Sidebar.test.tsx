import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { Sidebar } from '@/app/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

afterEach(() => vi.restoreAllMocks());

/**
 * Sidebar solo se renderiza en desktop (Tailwind `hidden md:flex`).
 * Usa un router real en memoria para comprobar también los cambios de ruta.
 */
function renderSidebar(
  pathname: string,
  opts: { collapsed?: boolean; onToggle?: () => void } = {},
) {
  function Shell() {
    const currentPath = useRouterState({ select: (state) => state.location.pathname });
    return (
      <>
        <Sidebar pathname={currentPath} collapsed={opts.collapsed} onToggle={opts.onToggle} />
        <Outlet />
      </>
    );
  }
  const root = createRootRoute({ component: Shell });
  const paths = ['/home', '/history', '/explore', '/about', '/settings'] as const;
  const tree = root.addChildren(
    paths.map((path) =>
      createRoute({
        getParentRoute: () => root,
        path,
        component: () => <div>{path}</div>,
      }),
    ),
  );
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  return render(
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>,
  );
}

describe('Sidebar (desktop)', () => {
  it('renderiza los enlaces de navegación con labels exactos', async () => {
    renderSidebar('/home');
    // Usar nombre exacto para no colisionar con el LockUp ("Manualito · ir al inicio")
    expect(await screen.findByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Biblioteca' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('marca el item activo con aria-current="page" según el pathname', async () => {
    renderSidebar('/history');
    const biblioteca = await screen.findByRole('link', { name: 'Biblioteca' });
    expect(biblioteca).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Ajustes' })).not.toHaveAttribute('aria-current');
  });

  it('cuando el pathname es /home, "Inicio" está activo', async () => {
    renderSidebar('/home');
    expect(await screen.findByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('cuando el pathname es /settings, "Ajustes" está activo', async () => {
    renderSidebar('/settings');
    expect(await screen.findByRole('link', { name: 'Ajustes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('incluye el lockup de marca como enlace al home', async () => {
    renderSidebar('/home');
    // El LockUp en el header del sidebar tiene aria-label "Manualito · ir al inicio".
    expect(
      await screen.findByRole('link', { name: /Manualito · ir al inicio/i }),
    ).toBeInTheDocument();
  });

  it('expone una región accesible (aside) con label "Navegación principal"', async () => {
    renderSidebar('/home');
    expect(
      await screen.findByRole('complementary', { name: /Navegación principal/i }),
    ).toBeInTheDocument();
  });

  it('expandida: el botón de plegado expone "Contraer menú" y dispara onToggle', async () => {
    const onToggle = vi.fn();
    renderSidebar('/home', { onToggle });
    const toggle = await screen.findByRole('button', { name: 'Contraer menú' });
    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('plegada: solo iconos pero conserva nombres accesibles', async () => {
    renderSidebar('/home', { collapsed: true });
    // Los enlaces siguen siendo accesibles por su nombre (label en sr-only).
    expect(await screen.findByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
    // El toggle ahora ofrece expandir.
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument();
  });

  it('mantiene una sola selección al invertir la navegación entre secciones y utilidades', async () => {
    const user = userEvent.setup();
    renderSidebar('/home');
    await screen.findByRole('link', { name: 'Inicio' });
    const navigation = within(screen.getByRole('navigation', { name: 'Secciones de la app' }));

    for (const label of ['Explorar', 'Ajustes', 'Inicio', 'Ayuda', 'Biblioteca']) {
      const link = navigation.getByRole('link', { name: label });
      await user.click(link);
      expect(navigation.getAllByRole('link', { current: 'page' })).toEqual([link]);
    }

    expect(await screen.findByText('/history')).toBeInTheDocument();
  });

  it('conserva selección y foco al activar movimiento reducido después de navegar', async () => {
    // Solo se sustituye la preferencia del sistema, que jsdom no implementa.
    const original = window.matchMedia;
    const media = Object.assign(new EventTarget(), {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === media.media ? (media as unknown as MediaQueryList) : original(query),
    );
    const user = userEvent.setup();
    renderSidebar('/home');
    const explore = await screen.findByRole('link', { name: 'Explorar' });
    const navigation = within(screen.getByRole('navigation', { name: 'Secciones de la app' }));

    await user.click(explore);
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });

    expect(explore).toHaveFocus();
    expect(navigation.getAllByRole('link', { current: 'page' })).toEqual([explore]);
    expect(await screen.findByText('/explore')).toBeInTheDocument();
    const home = navigation.getByRole('link', { name: 'Inicio' });
    await user.click(home);
    expect(navigation.getAllByRole('link', { current: 'page' })).toEqual([home]);
    expect(await screen.findByText('/home')).toBeInTheDocument();
  });

  it.each([false, true])(
    'conserva navegación y foco con teclado, plegada=%s',
    async (collapsed) => {
      const user = userEvent.setup();
      renderSidebar('/home', { collapsed });
      const home = await screen.findByRole('link', { name: 'Inicio' });
      const library = screen.getByRole('link', { name: 'Biblioteca' });
      const navigation = within(screen.getByRole('navigation', { name: 'Secciones de la app' }));
      home.focus();

      await user.keyboard('{Tab}{Enter}');
      expect(await screen.findByText('/history')).toBeInTheDocument();
      expect(library).toHaveFocus();
      expect(navigation.getAllByRole('link', { current: 'page' })).toEqual([library]);

      await user.keyboard('{Shift>}{Tab}{/Shift}{Enter}');
      expect(await screen.findByText('/home')).toBeInTheDocument();
      expect(home).toHaveFocus();
      expect(navigation.getAllByRole('link', { current: 'page' })).toEqual([home]);
    },
  );
});
