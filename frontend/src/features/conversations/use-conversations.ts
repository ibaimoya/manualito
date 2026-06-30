import { queryOptions } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { storage } from '@/shared/lib/storage';

/** Clave de cache de las conversaciones de un juego. */
export function conversationsKey(gameId: string) {
  return ['conversations', gameId] as const;
}

export function conversationMessagesKey(conversationId: string) {
  return ['conversations', 'messages', conversationId] as const;
}

/** Conversaciones del usuario para un juego ("GET /api/games/{id}/conversations"). */
export function conversationsQueryOptions(gameId: string) {
  return queryOptions({
    queryKey: conversationsKey(gameId),
    queryFn: async ({ signal }) =>
      (await conversationsApi.list(gameId, undefined, signal)).conversations,
    staleTime: 30_000,
    // Mientras alguna conversación genera respuesta, re-sondea para encender y
    // apagar sola la ruleta de "generando" en su fila.
    refetchInterval: (query) =>
      query.state.data?.some((conversation) => conversation.has_pending_reply) ? 1_500 : false,
  });
}

/**
 * Punto de "sin leer": una conversación tiene respuesta sin leer si su
 * "updated_at" cambió desde la última vez que se abrió (y ya no genera). Solo
 * cuenta las que el usuario abrió alguna vez, para no marcar las antiguas.
 */
export function useConversationsRead() {
  // Se lee una vez: abrir un chat navega fuera y remonta la lista al volver.
  const [seen] = useState(() => storage.readConversationsSeen());
  const isUnread = useCallback(
    (conversation: ConversationSummary) =>
      !conversation.has_pending_reply &&
      seen[conversation.id] !== undefined &&
      seen[conversation.id] !== conversation.updated_at,
    [seen],
  );
  return { isUnread };
}

/** Mensajes de una conversación ("GET /api/conversations/{id}/messages"). */
export function conversationMessagesQueryOptions(conversationId: string) {
  return queryOptions({
    queryKey: conversationMessagesKey(conversationId),
    queryFn: async ({ signal }) =>
      (await conversationsApi.listMessages(conversationId, undefined, signal)).messages,
    staleTime: 30_000,
    refetchIntervalInBackground: true,
  });
}
