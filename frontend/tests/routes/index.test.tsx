import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { Route as IndexRoute } from '@/routes/index';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
});

/**
 * Ruta `/` — `beforeLoad` redirige a `/onboarding` o `/home` según si el
 * usuario ha visto el onboarding.  Montamos un router fake con las 3
 * rutas y un history en `/` para que el redirect ocurra y podamos
 * comprobar dónde aterriza.
 */
function renderIndex() {
  const root = createRootRoute({ component: Outlet });
  const idx = createRoute({
    getParentRoute: () => root,
    path: '/',
    // Reaprovechamos la lógica real del beforeLoad — no la mockeamos.
    beforeLoad: (
      IndexRoute as unknown as { options: { beforeLoad: () => void } }
    ).options.beforeLoad,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div>HomeScreen</div>,
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    component: () => <div>OnboardingScreen</div>,
  });
  const tree = root.addChildren([idx, home, onboarding]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('/ (index)', () => {
  it('cuando el onboarding NO se ha visto → redirige a /onboarding', async () => {
    // localStorage limpio = onboarding no visto.
    renderIndex();
    await waitFor(() => {
      expect(screen.getByText('OnboardingScreen')).toBeInTheDocument();
    });
    expect(screen.queryByText('HomeScreen')).not.toBeInTheDocument();
  });

  it('cuando el onboarding YA se ha visto → redirige a /home', async () => {
    storage.markOnboardingSeen();
    renderIndex();
    await waitFor(() => {
      expect(screen.getByText('HomeScreen')).toBeInTheDocument();
    });
    expect(screen.queryByText('OnboardingScreen')).not.toBeInTheDocument();
  });
});
