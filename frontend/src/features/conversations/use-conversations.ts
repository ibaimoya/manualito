import { queryOptions } from '@tanstack/react-query';
import { conversationsApi } from '@/shared/api/conversations';

/** Clave de cache de las conversaciones de un juego. */
export function conversationsKey(gameId: string) {
  return ['conversations', gameId] as const;
}

/** Conversaciones del usuario para un juego ("GET /api/games/{id}/conversations"). */
export function conversationsQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: conversationsKey(gameId),
    queryFn: async ({ signal }) => (await conversationsApi.list(gameId, undefined, signal)).conversations,
    staleTime: 30_000,
  });
}

/** Mensajes de una conversación ("GET /api/conversations/{id}/messages"). */
export function conversationMessagesQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: ['conversations', 'messages', conversationId] as const,
    queryFn: async ({ signal }) =>
      (await conversationsApi.listMessages(conversationId, undefined, signal)).messages,
    staleTime: 30_000,
  });
}
