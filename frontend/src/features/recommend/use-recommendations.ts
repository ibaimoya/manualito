import { queryOptions } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

/** Clave de cache de las recomendaciones del usuario. */
export const RECOMMENDATIONS_KEY = ['recommendations'] as const;

const RECOMMENDATIONS_LIMIT = 6;

/** Recomendaciones content-based del usuario ("GET /api/recommendations"). */
export function recommendationsQueryOptions() {
  return queryOptions({
    queryKey: RECOMMENDATIONS_KEY,
    queryFn: async ({ signal }) =>
      (await api.getRecommendations({ limit: RECOMMENDATIONS_LIMIT }, signal)).recommendations,
    staleTime: 5 * 60_000,
  });
}
