import type { QueryClient } from '@tanstack/react-query';

/** Contexto inyectado en el router para que los `beforeLoad` resuelvan sesión. */
export interface RouterContext {
  queryClient: QueryClient;
}
