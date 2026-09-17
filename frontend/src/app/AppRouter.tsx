import { RouterProvider, createRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { routeTree } from '../routeTree.gen';
import { entryViewTransition } from '@/features/auth/entry-transition';

/** RouterProvider inyecta queryClient para compartir la caché de sesión con las rutas. */
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultViewTransition: globalThis.CSS?.supports('selector(:active-view-transition-type(entry))')
    ? entryViewTransition
    : false,
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
