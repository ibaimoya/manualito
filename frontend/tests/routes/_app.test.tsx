import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/app/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route as AppRoute } from '@/routes/_app';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';

const AppLayout = (AppRoute as unknown as { options: { component: React.FC } }).options.component;

/** Monta el shell autenticado (`AppLayout`) con rutas hijas controladas. */
function mountApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Sin sesión en cache → el banner de verificación no se monta.
  queryClient.setQueryData(AUTH_ME_KEY, null);
  const root = createRootRoute();
  const app = createRoute({ getParentRoute: () => root, id: 'app', component: AppLayout });
  const page = (childPath: string, label: string) =>
    createRoute({
      getParentRoute: () => app,
      path: childPath,
      component: () => <div data-testid={`page-${label}`}>{label}</div>,
    });
  const tree = root.addChildren([
    app.addChildren([
      page('/home', 'home'),
      page('/history', 'history'),
      page('/capture', 'capture'),
      page('/processing', 'processing'),
      page('/result/$manualId', 'result'),
      page('/chat/$manualId', 'chat'),
    ]),
  ]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('_app shell', () => {
  it('incluye el skip-link "Saltar al contenido" (WCAG 2.4.1)', async () => {
    mountApp('/home');
    expect(await screen.findByRole('link', { name: /Saltar al contenido/i })).toBeInTheDocument();
  });

  it('en /home muestra la navegación principal', async () => {
    mountApp('/home');
    await screen.findByTestId('page-home');
    expect(
      await screen.findByRole('navigation', { name: /Navegación principal/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['/capture', 'capture'],
    ['/processing', 'processing'],
    ['/result/m1', 'result'],
    ['/chat/m1', 'chat'],
  ])('oculta la navegación principal en %s (ruta inmersiva)', async (path, label) => {
    mountApp(path);
    await screen.findByTestId(`page-${label}`);
    expect(
      screen.queryByRole('navigation', { name: /Navegación principal/i }),
    ).not.toBeInTheDocument();
  });

  it('monta la sidebar (shell de escritorio) también en rutas inmersivas', async () => {
    mountApp('/result/m1');
    await screen.findByTestId('page-result');
    // La sidebar (oculta por CSS en móvil) aporta el shell en md+ a result/chat.
    expect(screen.getByRole('navigation', { name: /Secciones de la app/i })).toBeInTheDocument();
  });
});
