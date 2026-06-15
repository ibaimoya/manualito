import { RouterProvider, createRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { routeTree } from '../routeTree.gen';

/**
 * Router de la app — file-based routing.
 *
 * El "queryClient" se inyecta en "RouterProvider" (no en module-scope) para que
 * el "beforeLoad" raíz pueda resolver la sesión con la misma cache que la UI.
 */
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  context: { queryClient: undefined! },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  const queryClient = useQueryClient();
  return <RouterProvider router={router} context={{ queryClient }} />;
}
