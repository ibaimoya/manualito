import { queryOptions } from '@tanstack/react-query';
import { accountApi } from '@/shared/api/account';

/** Contadores de actividad del perfil (`GET /api/me/stats`). */
export function accountStatsQueryOptions() {
  return queryOptions({
    queryKey: ['account', 'stats'] as const,
    queryFn: ({ signal }) => accountApi.stats(signal),
    staleTime: 60_000,
  });
}
