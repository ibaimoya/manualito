import { queryOptions } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export const DISCOVER_GAMES_KEY = ['games', 'discover'] as const;

export function discoverGamesQueryOptions(excludedGameIds: readonly string[] = []) {
  const excludedIds = [...new Set(excludedGameIds)].sort((a, b) => a.localeCompare(b));
  return queryOptions({
    queryKey: [...DISCOVER_GAMES_KEY, { excludedGameIds: excludedIds }],
    queryFn: async ({ signal }) => (await api.discoverGames(excludedIds, signal)).games,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
