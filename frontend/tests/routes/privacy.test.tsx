import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { Route as PrivacyRoute } from '@/routes/_app.privacy';

function renderPrivacy() {
  const root = createRootRoute({ component: Outlet });
  const privacy = createRoute({
    getParentRoute: () => root,
    path: '/privacy',
    component: (PrivacyRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const router = createRouter({
    routeTree: root.addChildren([privacy]),
    history: createMemoryHistory({ initialEntries: ['/privacy'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('/privacy', () => {
  it('renderiza la política con su título y secciones clave', async () => {
    renderPrivacy();
    expect(
      await screen.findByRole('heading', { level: 1, name: /Política de privacidad/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Qué datos tratamos/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Tus derechos/i })).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderPrivacy();
    await screen.findByRole('heading', { level: 1 });
    expect(await axe(container)).toHaveNoViolations();
  });
});
