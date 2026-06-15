import { JSON_HEADERS, TIMEOUT, queryString, request, requestVoid } from './http';
import type { AnswerSource } from './client';

/**
 * Cliente de conversaciones persistentes: cuelgan de un juego; los mensajes,
 * de una conversación. El título lo genera el backend a partir del primer
 * turno.
 */

/** Cota del backend para una pregunta (USER_MESSAGE_MAX_LENGTH). */
export const QUESTION_MAX = 4_000;

export type MessageRole = 'user' | 'assistant';

export interface ConversationSummary {
  id: string;
  game_id: string;
  game_name: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  sources: AnswerSource[];
}

export interface MessageListResponse {
  messages: ConversationMessage[];
}

export interface SendMessageResponse {
  conversation: ConversationSummary;
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
}

interface PageParams {
  limit?: number;
  offset?: number;
}


export const conversationsApi = {
  /** GET /api/games/{gameId}/conversations — conversaciones propias del juego. */
  async list(
    gameId: string,
    params?: PageParams,
    signal?: AbortSignal,
  ): Promise<ConversationListResponse> {
    const query = queryString({ limit: params?.limit, offset: params?.offset });
    return request<ConversationListResponse>(
      `/games/${encodeURIComponent(gameId)}/conversations${query}`,
      { method: 'GET', timeoutMs: TIMEOUT.QUICK, signal },
    );
  },

  /** POST /api/games/{gameId}/conversations — crea una conversación vacía (201). */
  async create(gameId: string, signal?: AbortSignal): Promise<ConversationSummary> {
    return request<ConversationSummary>(`/games/${encodeURIComponent(gameId)}/conversations`, {
      method: 'POST',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** GET /api/conversations/{id}/messages — mensajes de una conversación. */
  async listMessages(
    conversationId: string,
    params?: PageParams,
    signal?: AbortSignal,
  ): Promise<MessageListResponse> {
    const query = queryString({ limit: params?.limit, offset: params?.offset });
    return request<MessageListResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
      { method: 'GET', timeoutMs: TIMEOUT.QUICK, signal },
    );
  },

  /**
   * POST /api/conversations/{id}/messages — envía una pregunta, genera la
   * respuesta y devuelve el turno completo. Usa timeout LLM.
   */
  async sendMessage(
    conversationId: string,
    content: string,
    options?: { topK?: number },
    signal?: AbortSignal,
  ): Promise<SendMessageResponse> {
    const body: { content: string; top_k?: number } = { content };
    if (options?.topK != null) body.top_k = options.topK;
    return request<SendMessageResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: JSON_HEADERS,
        timeoutMs: TIMEOUT.LLM,
        signal,
      },
    );
  },

  /** PATCH /api/conversations/{id} — renombra una conversación propia. */
  async rename(
    conversationId: string,
    title: string,
    signal?: AbortSignal,
  ): Promise<ConversationSummary> {
    return request<ConversationSummary>(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** DELETE /api/conversations/{id} — borra una conversación propia (204). */
  async remove(conversationId: string, signal?: AbortSignal): Promise<void> {
    await requestVoid(`/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },
};
