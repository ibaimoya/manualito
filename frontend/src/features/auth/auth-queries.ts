import { queryOptions } from '@tanstack/react-query';
import { authApi, type AuthResponse } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/http';

export const AUTH_ME_KEY = ['auth', 'me'] as const;

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
