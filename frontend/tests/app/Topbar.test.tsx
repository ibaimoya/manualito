import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { DesktopTopbar, ScreenTopBar } from '@/app/Topbar';

function renderInRouter(node: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <>{node}</>,
  });
  const settings = createRoute({
    getParentRoute: () => root,
    path: '/settings',
    component: () => <div>Ajustes</div>,
  });
  const profile = createRoute({
    getParentRoute: () => root,
    path: '/profile',
    component: () => <div>Perfil</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, settings, profile]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('DesktopTopbar', () => {
  it('muestra el breadcrumb y el título de la sección activa', async () => {
    renderInRouter(<DesktopTopbar pathname="/history" />);
    const root = await screen.findByRole('link', { name: 'Inicio' });
    expect(root).toHaveAttribute('href', '/home');
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });

  it('en la raíz no hay breadcrumb: solo el título «Inicio»', async () => {
    renderInRouter(<DesktopTopbar pathname="/home" />);
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Ruta de navegación' }),
    ).not.toBeInTheDocument();
  });
});

describe('ScreenTopBar', () => {
  it('comparte la base: breadcrumb a Inicio + crumb de la pantalla', async () => {
    renderInRouter(<ScreenTopBar crumb="Catan" />);
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    // El crumb aparece en el breadcrumb (md+) y en el título móvil.
    expect(screen.getAllByText('Catan').length).toBeGreaterThan(0);
  });

  it('renderiza las acciones y el control de volver de la pantalla', async () => {
    renderInRouter(
      <ScreenTopBar
        crumb="Catan"
        back={<button type="button">Volver</button>}
        actions={<button type="button">Ver texto</button>}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Volver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver texto' })).toBeInTheDocument();
  });
});
