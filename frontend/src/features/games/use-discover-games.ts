import { queryOptions } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export const DISCOVER_GAMES_KEY = ['games', 'discover'] as const;

export function discoverGamesQueryOptions() {
  return queryOptions({
    queryKey: DISCOVER_GAMES_KEY,
    queryFn: async ({ signal }) => (await api.discoverGames(signal)).games,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
