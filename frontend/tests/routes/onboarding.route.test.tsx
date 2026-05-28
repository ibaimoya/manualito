import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { Route as OnboardingRoute } from '@/routes/onboarding';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Mock del componente Onboarding pesado — solo nos interesa el beforeLoad
// de la ruta, no la animación del bundle.
vi.mock('@/features/onboarding/Onboarding', () => ({
  Onboarding: () => <div>OnboardingComponent</div>,
}));

function renderOnboarding() {
  const root = createRootRoute({ component: Outlet });
  const ob = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    beforeLoad: (
      OnboardingRoute as unknown as { options: { beforeLoad: () => void } }
    ).options.beforeLoad,
    component: () => <div>OnboardingComponent</div>,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div>HomeScreen</div>,
  });
  const tree = root.addChildren([ob, home]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/onboarding'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('/onboarding (route guard)', () => {
  it('cuando NO se ha visto → renderiza el onboarding', async () => {
    renderOnboarding();
    await waitFor(() => {
      expect(screen.getByText('OnboardingComponent')).toBeInTheDocument();
    });
  });

  it('cuando YA se ha visto → redirige a /home (no debe re-mostrarlo)', async () => {
    // Catálogo bug #31: el onboarding cinematográfico solo se ve una vez.
    storage.markOnboardingSeen();
    renderOnboarding();
    await waitFor(() => {
      expect(screen.getByText('HomeScreen')).toBeInTheDocument();
    });
    expect(screen.queryByText('OnboardingComponent')).not.toBeInTheDocument();
  });
});
