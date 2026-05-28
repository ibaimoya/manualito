import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';

/**
 * Router de la app — file-based routing.
 *
 * `routeTree.gen.ts` lo genera `@tanstack/router-plugin` desde `src/routes/`.
 * Si no existe (primer arranque), Vite lo crea al detectar los routes.
 */
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
