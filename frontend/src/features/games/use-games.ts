import { queryOptions } from '@tanstack/react-query';
import { gamesApi } from '@/shared/api/games';

/** Raíz de las claves de cache del hub de juego. */
const GAMES_KEY = ['games'] as const;

export function gameDetailKey(gameId: string) {
  return [...GAMES_KEY, 'detail', gameId] as const;
}

/** Hub del juego: meta + valoración propia + pool de manuales. */
export function gameDetailQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: gameDetailKey(gameId),
    queryFn: ({ signal }) => gamesApi.detail(gameId, signal),
    staleTime: 30_000,
  });
}

/**
 * Explicación cacheada del juego. Mientras otro proceso la genera
 * (`status: generating`) se re-pide en intervalos cortos.
 */
export function gameExplanationQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: [...GAMES_KEY, 'explanation', gameId] as const,
    queryFn: ({ signal }) => gamesApi.explanation(gameId, signal),
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data?.status === 'generating' ? 2_500 : false),
  });
}
