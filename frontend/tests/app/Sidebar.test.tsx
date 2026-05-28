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
import { Sidebar } from '@/app/Sidebar';

/**
 * Sidebar solo se renderiza en desktop (Tailwind `hidden md:flex`).
 * Necesita un `<Link>` de TanStack Router → montamos un router fake mínimo
 * con las 3 rutas (`/home`, `/history`, `/settings`) para que los Links
 * no exploten.
 */
function renderSidebar(pathname: string) {
  const root = createRootRoute({
    component: () => (
      <>
        <Sidebar pathname={pathname} />
        <Outlet />
      </>
    ),
  });
  const make = (path: '/home' | '/history' | '/settings') =>
    createRoute({
      getParentRoute: () => root,
      path,
      component: () => <div>{path}</div>,
    });
  const tree = root.addChildren([make('/home'), make('/history'), make('/settings')]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('Sidebar (desktop)', () => {
  it('renderiza los 3 enlaces de navegación con labels exactos', async () => {
    renderSidebar('/home');
    // Usar nombre exacto para no colisionar con el LockUp ("Manualito · ir al inicio")
    expect(await screen.findByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('marca el item activo con aria-current="page" según el pathname', async () => {
    renderSidebar('/history');
    const historial = await screen.findByRole('link', { name: 'Historial' });
    expect(historial).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: 'Inicio' }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('link', { name: 'Ajustes' }),
    ).not.toHaveAttribute('aria-current');
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

  it('footer muestra la versión + stack para identificar el build', async () => {
    renderSidebar('/home');
    expect(await screen.findByText(/v 0\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/phi4/)).toBeInTheDocument();
    expect(screen.getByText(/ChromaDB/)).toBeInTheDocument();
  });
});
