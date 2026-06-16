import { JSON_HEADERS, TIMEOUT, request, requestVoid } from './http';
import type { AnswerSource } from './client';

/**
 * Cliente del hub de juego: detalle agregado (meta + valoración propia +
 * manuales visibles), explicación cacheada y valoraciones con estrellas.
 */

export interface GameRating {
  game_id: string;
  score: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface GamePoolManual {
  id: string;
  title: string | null;
  source_type: 'images' | 'pdf';
  page_count: number;
  created_at: string;
  /** Solo los manuales propios pueden abrirse en detalle y editarse. */
  is_own: boolean;
}

export interface GameDetail {
  id: string;
  name: string;
  bgg_id: number | null;
  year_published: number | null;
  min_players: number | null;
  max_players: number | null;
  playing_time_minutes: number | null;
  status: string;
  my_rating: GameRating | null;
  /** Si el usuario sigue el juego (aparece en su biblioteca). */
  is_following: boolean;
  manuals: GamePoolManual[];
  conversations_count: number;
  attribution: string;
}

export interface ExplanationSection {
  answer: string;
  sources: AnswerSource[];
}

export type ExplanationSectionKey = 'summary' | 'setup' | 'turns' | 'victory';

export interface GameExplanation {
  /** "generating" ⇒ otra petición la está generando; reintentar en breve. */
  status: 'ready' | 'generating' | 'failed';
  sections: Partial<Record<ExplanationSectionKey, ExplanationSection>> | null;
  generated_at: string | null;
  error_code?: string | null;
}

export interface RateGameInput {
  score: number;
  note?: string;
}

export interface MyGame {
  id: string;
  name: string;
  bgg_id: number | null;
  year_published: number | null;
  manuals_count: number;
  conversations_count: number;
  last_activity_at: string;
}

export interface MyGamesResponse {
  games: MyGame[];
}

export const gamesApi = {
  /** GET /api/games/mine — juegos con los que el usuario ha interactuado. */
  async listMine(signal?: AbortSignal): Promise<MyGamesResponse> {
    return request<MyGamesResponse>('/games/mine', {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** GET /api/games/{id} — hub del juego con la vista personal del usuario. */
  async detail(gameId: string, signal?: AbortSignal): Promise<GameDetail> {
    return request<GameDetail>(`/games/${encodeURIComponent(gameId)}`, {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /**
   * GET /api/games/{id}/explanation — explicación cacheada por juego; si el
   * conjunto de manuales cambió, el backend regenera el siguiente apartado.
   */
  async explanation(gameId: string, signal?: AbortSignal): Promise<GameExplanation> {
    return request<GameExplanation>(`/games/${encodeURIComponent(gameId)}/explanation`, {
      method: 'GET',
      timeoutMs: TIMEOUT.LLM,
      signal,
    });
  },

  /** PUT /api/games/{id}/rating — crea o actualiza la valoración propia. */
  async rate(gameId: string, input: RateGameInput, signal?: AbortSignal): Promise<GameRating> {
    return request<GameRating>(`/games/${encodeURIComponent(gameId)}/rating`, {
      method: 'PUT',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** DELETE /api/games/{id}/rating — quita la valoración propia (204). */
  async removeRating(gameId: string, signal?: AbortSignal): Promise<void> {
    await requestVoid(`/games/${encodeURIComponent(gameId)}/rating`, {
      method: 'DELETE',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/games/{id}/follow — sigue el juego (204). */
  async follow(gameId: string, signal?: AbortSignal): Promise<void> {
    await requestVoid(`/games/${encodeURIComponent(gameId)}/follow`, {
      method: 'POST',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** DELETE /api/games/{id}/follow — deja de seguir el juego (204). */
  async unfollow(gameId: string, signal?: AbortSignal): Promise<void> {
    await requestVoid(`/games/${encodeURIComponent(gameId)}/follow`, {
      method: 'DELETE',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },
};
