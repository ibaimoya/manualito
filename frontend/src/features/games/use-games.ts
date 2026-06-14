import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { gamesApi, type GameDetail } from '@/shared/api/games';

/** Raíz de las claves de cache del hub de juego. */
const GAMES_KEY = ['games'] as const;

export function gameDetailKey(gameId: string) {
  return [...GAMES_KEY, 'detail', gameId] as const;
}

/** Clave de la biblioteca (juegos seguidos); invalidar al seguir o tras una acción. */
export const myGamesKey = [...GAMES_KEY, 'mine'] as const;

/** Biblioteca del usuario: los juegos que sigue, por actividad reciente. */
export function myGamesQueryOptions() {
  return queryOptions({
    queryKey: myGamesKey,
    queryFn: ({ signal }) => gamesApi.listMine(signal),
    staleTime: 30_000,
  });
}

/**
 * Sigue / deja de seguir un juego con actualización optimista del detalle.
 * Al asentar invalida detalle y biblioteca para reflejar el cambio real.
 */
export function useToggleFollow(gameId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (following: boolean) =>
      following ? gamesApi.follow(gameId) : gamesApi.unfollow(gameId),
    onMutate: async (following) => {
      await qc.cancelQueries({ queryKey: gameDetailKey(gameId) });
      const previous = qc.getQueryData<GameDetail>(gameDetailKey(gameId));
      if (previous) {
        qc.setQueryData<GameDetail>(gameDetailKey(gameId), {
          ...previous,
          is_following: following,
        });
      }
      return { previous };
    },
    onError: (_error, _following, context) => {
      if (context?.previous) qc.setQueryData(gameDetailKey(gameId), context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: gameDetailKey(gameId) }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: myGamesKey }).catch(() => undefined);
    },
  });
}

/** Hub del juego: meta + valoración propia + manuales visibles. */
export function gameDetailQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: gameDetailKey(gameId),
    queryFn: ({ signal }) => gamesApi.detail(gameId, signal),
    staleTime: 30_000,
  });
}

/**
 * Explicación cacheada del juego. Mientras otro proceso la genera
 * ("status: generating") se re-pide en intervalos cortos.
 */
export function gameExplanationQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: [...GAMES_KEY, 'explanation', gameId] as const,
    queryFn: ({ signal }) => gamesApi.explanation(gameId, signal),
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data?.status === 'generating' ? 2_500 : false),
  });
}
