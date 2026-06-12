import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { authApi, type AuthResponse } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/http';
import { clearApiSwCache } from '@/shared/lib/swCache';
import { resetResendCooldown } from './use-resend-verification';

export const AUTH_ME_KEY = ['auth', 'me'] as const;

/**
 * Borra cualquier rastro de la cuenta saliente: cache de queries y respuestas /api
 * del service worker. El marcador de sesión se repone a null tras el clear
 * para que el siguiente `beforeLoad` no tenga que volver a pedir /api/me.
 */
export async function dropSessionCaches(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  queryClient.setQueryData(AUTH_ME_KEY, null);
  resetResendCooldown();
  await clearApiSwCache();
}

/**
 * Sesión actual vía `/api/me`. Un 401 es estado anónimo legítimo (devolvemos
 * `null`), no un error de UI; el resto de errores sí se propagan.
 */
export function meQueryOptions() {
  return queryOptions({
    queryKey: AUTH_ME_KEY,
    queryFn: async ({ signal }): Promise<AuthResponse | null> => {
      try {
        return await authApi.me(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
