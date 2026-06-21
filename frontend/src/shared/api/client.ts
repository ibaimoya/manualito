import { mapApiError } from './error-mapper';
import { ApiError, JSON_HEADERS, TIMEOUT, queryString, request, requestVoid } from './http';

/**
 * Recursos de manuales y juegos. El transporte (request, ApiError, CSRF) vive
 * en "./http". Re-exporta ApiError y helpers para no romper los imports de
 * "@/shared/api/client".
 */

export { ApiError, apiErrorNotification, isAbortApiError } from './http';
export type { ApiErrorNotification } from './http';

/* ============================================================
   Tipos del contrato (manuales / juegos)
   ============================================================ */

export interface OcrLine {
  text: string;
  confidence: number | null;
}

export interface AnswerSource {
  manual_id: string;
  manual_title: string | null;
  page: number;
  /** Si el manual citado es del usuario: solo entonces se puede abrir el visor. */
  is_own: boolean;
}

export type ManualStatus = 'indexing' | 'active' | 'pending_review' | 'hidden' | 'failed';

export type ManualVisibility = 'private' | 'shared';

export type ManualDedupStatus = 'none' | 'reused';

export interface ManualCreatedResponse {
  manual_id: string;
  game_id: string;
  status: ManualStatus;
  visibility: ManualVisibility;
  source_type: 'images' | 'pdf';
  page_count: number;
}

/** Resumen de manual usado en listados ("GET /api/manuals"). */
export interface ManualSummary {
  id: string;
  game_id: string;
  game_name: string;
  title: string | null;
  status: ManualStatus;
  visibility: ManualVisibility;
  source_type: 'images' | 'pdf';
  page_count: number;
  /** Páginas idénticas a otras ya subidas: copiadas, no reprocesadas ni contadas. */
  duplicate_page_count: number;
  language: string | null;
  chunks_indexed: number;
  created_at: string;
  indexed_at: string | null;
}

export interface ManualListResponse {
  manuals: ManualSummary[];
}

export interface GameSearchItem {
  id: string;
  name: string;
  bgg_id: number | null;
  year_published: number | null;
  manuals_count: number;
}

export interface GameSearchResponse {
  games: GameSearchItem[];
  attribution: string;
}

/** Juego sugerido por el recomendador content-based. */
export interface RecommendedGame {
  id: string;
  name: string;
  bgg_id: number | null;
  year_published: number | null;
  /** Motivo legible de la recomendación (p. ej. "Porque tienes Catan"). */
  reason: string;
}

export interface RecommendationsResponse {
  recommendations: RecommendedGame[];
  /** Atribución exigida por el ToU de la API de BoardGameGeek. */
  attribution: string;
}

export interface ManualDetailPage {
  page_number: number;
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed';
  text_source: 'none' | 'ocr' | 'pdf_text' | 'user_edit';
  text_quality: 'ok' | 'empty' | 'low_confidence' | null;
  dedup_status: ManualDedupStatus;
  image_available: boolean;
  image_width: number | null;
  image_height: number | null;
  ocr_confidence_mean: number | null;
  ocr_lines: OcrLine[];
}

/** Detalle de manual = resumen + páginas OCR. */
export interface ManualDetailResponse extends ManualSummary {
  pages: ManualDetailPage[];
}

export interface ManualProcessingPage {
  page_number: number;
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed';
  text_quality: 'ok' | 'empty' | 'low_confidence' | null;
  dedup_status: ManualDedupStatus;
}

export interface ManualProcessingResponse {
  manual_id: string;
  status: ManualStatus;
  page_count: number;
  completed_pages: number;
  failed_pages: number;
  pages: ManualProcessingPage[];
}

export type CreateManualInput =
  | {
      title: string;
      images: File[];
      visibility?: ManualVisibility;
      language?: string;
      gameId: string;
    }
  | {
      title: string;
      pdf: File;
      visibility?: ManualVisibility;
      language?: string;
      gameId: string;
    };

/* ============================================================
   Endpoints
   ============================================================ */

export const api = {
  /** GET /health — proxied al /health del backend (fuera de /api). */
  async health(): Promise<{ status: string }> {
    const res = await fetch('/health', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new ApiError(mapApiError({ status: res.status }), res.status, null);
    }
    return (await res.json()) as { status: string };
  },

  /** POST /api/manuals — guarda la fuente y devuelve 202 mientras procesa. */
  async createManual(
    input: CreateManualInput,
    signal?: AbortSignal,
  ): Promise<ManualCreatedResponse> {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('visibility', input.visibility ?? 'private');
    if (input.language) fd.append('language', input.language);
    fd.append('game_id', input.gameId);
    if ('pdf' in input) {
      fd.append('pdf', input.pdf);
    } else {
      for (const image of input.images) {
        fd.append('images', image);
      }
    }
    return request<ManualCreatedResponse>('/manuals', {
      method: 'POST',
      body: fd,
      timeoutMs: TIMEOUT.UPLOAD,
      signal,
    });
  },

  /** GET /api/manuals — lista los manuales del usuario autenticado. */
  async listManuals(
    params?: { limit?: number; offset?: number },
    signal?: AbortSignal,
  ): Promise<ManualListResponse> {
    const query = queryString({ limit: params?.limit, offset: params?.offset });
    return request<ManualListResponse>(`/manuals${query}`, {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** GET /api/manuals/{id} — detalle completo con páginas y líneas OCR. */
  async getManual(manualId: string, signal?: AbortSignal): Promise<ManualDetailResponse> {
    return request<ManualDetailResponse>(`/manuals/${encodeURIComponent(manualId)}`, {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** URL autenticada de la imagen de una página de manual propio. */
  manualPageImageUrl(manualId: string, pageNumber: number): string {
    return `/api/manuals/${encodeURIComponent(manualId)}/pages/${pageNumber}/image`;
  },

  /** GET /api/manuals/{id}/processing — progreso ligero para polling. */
  async getManualProcessing(
    manualId: string,
    signal?: AbortSignal,
  ): Promise<ManualProcessingResponse> {
    return request<ManualProcessingResponse>(
      `/manuals/${encodeURIComponent(manualId)}/processing`,
      {
        method: 'GET',
        timeoutMs: TIMEOUT.QUICK,
        signal,
      },
    );
  },

  /** DELETE /api/manuals/{id} — borra un manual propio (204). */
  async deleteManual(manualId: string, signal?: AbortSignal): Promise<void> {
    await requestVoid(`/manuals/${encodeURIComponent(manualId)}`, {
      method: 'DELETE',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /**
   * PUT /api/manuals/{id}/pages/{n}/text — sustituye a mano el texto de una
   * página (solo manuales privados) y reindexa sus chunks.
   */
  async editPageText(
    manualId: string,
    pageNumber: number,
    text: string,
    signal?: AbortSignal,
  ): Promise<ManualDetailPage> {
    return request<ManualDetailPage>(
      `/manuals/${encodeURIComponent(manualId)}/pages/${pageNumber}/text`,
      {
        method: 'PUT',
        body: JSON.stringify({ text }),
        headers: JSON_HEADERS,
        timeoutMs: TIMEOUT.UPLOAD,
        signal,
      },
    );
  },

  /** POST /api/manuals/{id}/reprocess — reindexa el manual entero (202). */
  async reprocessManual(manualId: string, signal?: AbortSignal): Promise<ManualProcessingResponse> {
    return request<ManualProcessingResponse>(`/manuals/${encodeURIComponent(manualId)}/reprocess`, {
      method: 'POST',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/manuals/{id}/pages/{n}/reprocess — reindexa una página (202). */
  async reprocessPage(
    manualId: string,
    pageNumber: number,
    signal?: AbortSignal,
  ): Promise<ManualProcessingResponse> {
    return request<ManualProcessingResponse>(
      `/manuals/${encodeURIComponent(manualId)}/pages/${pageNumber}/reprocess`,
      { method: 'POST', timeoutMs: TIMEOUT.QUICK, signal },
    );
  },

  /** GET /api/games — typeahead de juegos seleccionables (sin auth). */
  async searchGames(query: string, signal?: AbortSignal): Promise<GameSearchResponse> {
    return request<GameSearchResponse>(`/games?q=${encodeURIComponent(query)}&limit=5`, {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/games — alta de un juego ausente de BGG; lo deja seleccionable. */
  async createGame(name: string, signal?: AbortSignal): Promise<GameSearchItem> {
    return request<GameSearchItem>('/games', {
      method: 'POST',
      body: JSON.stringify({ name }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /**
   * GET /api/recommendations — juegos sugeridos para el usuario (content-based
   * sobre los metadatos de su biblioteca).
   */
  async getRecommendations(
    params?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<RecommendationsResponse> {
    const query = queryString({ limit: params?.limit });
    return request<RecommendationsResponse>(`/recommendations${query}`, {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },
};
