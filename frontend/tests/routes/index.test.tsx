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
import type { AuthUser } from '@/shared/api/auth';

afterEach(() => {
  localStorage.clear();
});

const FAKE_USER: AuthUser = {
  id: 'u1',
  email: 'ana@example.com',
  username: 'ana',
  role: 'user',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  last_login_at: null,
  email_verified_at: null,
  avatar_color: null,
  avatar_figure: null,
};

/**
 * `/` redirige según sesión (la inyecta el beforeLoad raíz) y el flag de
 * onboarding. Montamos un root sintético que devuelve `user` en su contexto.
 */
function renderIndex(opts: { user: AuthUser | null; seen: boolean }) {
  if (opts.seen) storage.markOnboardingSeen();
  const root = createRootRoute({
    beforeLoad: () => ({ user: opts.user }),
    component: Outlet,
  });
  const idx = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad: (IndexRoute as unknown as { options: { beforeLoad: () => void } }).options
      .beforeLoad,
  });
  const page = (path: string, label: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <div>{label}</div> });
  const tree = root.addChildren([
    idx,
    page('/home', 'HomeScreen'),
    page('/onboarding', 'OnboardingScreen'),
    page('/login', 'LoginScreen'),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('/ (index)', () => {
  it('sin sesión y onboarding NO visto → /onboarding', async () => {
    renderIndex({ user: null, seen: false });
    await waitFor(() => expect(screen.getByText('OnboardingScreen')).toBeInTheDocument());
  });

  it('sin sesión y onboarding visto → /login', async () => {
    renderIndex({ user: null, seen: true });
    await waitFor(() => expect(screen.getByText('LoginScreen')).toBeInTheDocument());
  });

  it('con sesión → /home', async () => {
    renderIndex({ user: FAKE_USER, seen: true });
    await waitFor(() => expect(screen.getByText('HomeScreen')).toBeInTheDocument());
  });
});
