import { describe, expect, it, vi } from 'vitest';
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

vi.mock('@/features/auth/use-auth', () => ({
  useAuth: () => ({
    user: { username: 'Marta Álvarez', email: 'marta@x.com' },
    isAuthenticated: true,
  }),
}));

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
    expect(await screen.findByText('Manualito')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });

  it('el avatar usa iniciales y enlaza al perfil', async () => {
    renderInRouter(<DesktopTopbar pathname="/home" />);
    const avatar = await screen.findByRole('link', { name: /Tu perfil/i });
    expect(avatar).toHaveAttribute('href', '/profile');
    expect(avatar).toHaveTextContent('MÁ');
  });

  it('permite sobreescribir el crumb (páginas de juego)', async () => {
    renderInRouter(<DesktopTopbar crumb="Catan" />);
    expect(await screen.findByText('Manualito')).toBeInTheDocument();
    expect(screen.getByText('Catan')).toBeInTheDocument();
  });
});

describe('ScreenTopBar', () => {
  it('comparte la base: breadcrumb a Manualito + crumb de la pantalla', async () => {
    renderInRouter(<ScreenTopBar crumb="Catan" />);
    expect(await screen.findByText('Manualito')).toBeInTheDocument();
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
