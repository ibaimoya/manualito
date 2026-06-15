import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type { FC } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import type { AuthUser } from '@/shared/api/auth';

/** Usuario de fixture con la shape completa de `UserPublic`. */
export const TEST_USER: AuthUser = {
  id: 'user-001',
  email: 'marta@example.com',
  username: 'marta',
  role: 'user',
  status: 'active',
  created_at: '2026-05-01T09:00:00.000Z',
  last_login_at: '2026-05-26T10:00:00.000Z',
  email_verified_at: '2026-05-01T09:05:00.000Z',
  avatar_color: null,
  avatar_figure: null,
};

/** Extrae el componente real de un file-route de TanStack Router. */
export function routeComponent(route: unknown): FC {
  return (route as { options: { component: FC } }).options.component;
}

/**
 * Monta una pantalla en un mini-router con la sesión sembrada en cache
 * (useAuth no dispara fetch). `stubs` añade rutas de destino como divs
 * con su etiqueta, para poder asertar navegaciones.
 */
export function renderRoute({
  path,
  initialEntry,
  component,
  stubs = {},
  user = TEST_USER,
  validateSearch,
}: Readonly<{
  path: string;
  initialEntry: string;
  component: FC;
  stubs?: Record<string, string>;
  user?: AuthUser | null;
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>;
}>) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(AUTH_ME_KEY, user ? { user, csrf_token: 'csrf-test-token' } : null);

  const root = createRootRoute({ component: Outlet });
  // Como en el layout real (_app), la pantalla vive dentro de <main>: sus
  // <header> internos no son landmarks banner duplicados para axe.
  const Component = component;
  const main = createRoute({
    getParentRoute: () => root,
    path,
    ...(validateSearch ? { validateSearch } : {}),
    component: () => (
      <main>
        <Component />
      </main>
    ),
  });
  const stubRoutes = Object.entries(stubs).map(([stubPath, label]) =>
    createRoute({
      getParentRoute: () => root,
      path: stubPath,
      component: () => <div>{label}</div>,
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren([main, ...stubRoutes]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });

  const result = render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { qc, ...result };
}
