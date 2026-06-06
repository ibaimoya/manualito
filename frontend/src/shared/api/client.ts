import { mapApiError, type ApiErrorView } from './error-mapper';

/**
 * Cliente HTTP minimal.  Construido a mano (no axios) para:
 *   - Mantener el bundle pequeño (la PWA va a móvil).
 *   - No depender de codegen para los 5 endpoints iniciales.
 *   - Que `@hey-api/openapi-ts` pueda generar después sin chocar.
 *
 * Convenciones:
 *   - baseUrl `/api` → relativo, lo resuelve vite proxy (dev) o nginx (prod).
 *   - timeouts por endpoint para separar uploads, OCR y preguntas al LLM.
 *   - Mapea errores a `ApiErrorView` (ver error-mapper.ts).
 */

const DEFAULT_TIMEOUT_MS = 120_000;
const BASE_URL = '/api';

export class ApiError extends Error {
  public readonly view: ApiErrorView;
  public readonly status: number | undefined;
  public readonly raw: unknown;

  constructor(view: ApiErrorView, status: number | undefined, raw: unknown) {
    super(view.message);
    this.name = 'ApiError';
    this.view = view;
    this.status = status;
    this.raw = raw;
  }
}

export interface ApiErrorNotification {
  title: string;
  id: string;
  description: string;
}

export function isAbortApiError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return (
    error instanceof ApiError &&
    error.raw instanceof DOMException &&
    error.raw.name === 'AbortError'
  );
}

export function apiErrorNotification(
  error: unknown,
  idPrefix: string,
  fallback: ApiErrorNotification,
): ApiErrorNotification {
  if (error instanceof ApiError) {
    return {
      title: error.view.title,
      id: `${idPrefix}-${error.view.code}`,
      description: error.view.message,
    };
  }
  return fallback;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  /** Cabeceras adicionales — Content-Type lo gestiona body. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);

  // Si nos pasaron un signal externo, lo unimos al nuestro.
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(opts.signal?.reason), {
      once: true,
    });
  }

  try {
    const response = await fetch(url, {
      method: opts.method ?? 'GET',
      body: opts.body,
      headers: opts.headers,
      signal: controller.signal,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      // Intenta extraer JSON; si no hay, usa solo el status.
      let raw: unknown = null;
      try {
        raw = await response.clone().json();
      } catch {
        try {
          raw = await response.text();
        } catch {
          /* noop */
        }
      }
      throw new ApiError(
        mapApiError({ status: response.status, raw }),
        response.status,
        raw,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(mapApiError({ status: 504 }), 504, err);
    }
    throw new ApiError(mapApiError(err), undefined, err);
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   Endpoints reales del backend FastAPI
   ============================================================ */

export interface OcrLine {
  text: string;
  confidence: number | null;
}

export interface OcrLinesResponse {
  lines: OcrLine[];
}

export interface ManualCreatedResponse {
  manual_id: string;
  game_id: string;
  status: ManualStatus;
  visibility: 'private' | 'shared';
  source_type: 'images' | 'pdf';
  page_count: number;
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

export type ManualStatus = 'indexing' | 'active' | 'pending_review' | 'hidden' | 'failed';

export interface ManualDetailPage {
  page_number: number;
  ocr_status: 'pending' | 'completed' | 'failed';
  text_source: 'none' | 'ocr' | 'pdf_text';
  text_quality: 'ok' | 'empty' | 'low_confidence' | null;
  ocr_confidence_mean: number | null;
  ocr_lines: OcrLine[];
}

export interface ManualDetailResponse {
  id: string;
  game_id: string;
  game_name: string;
  title: string | null;
  status: ManualStatus;
  visibility: 'private' | 'shared';
  language: string | null;
  chunks_indexed: number;
  created_at: string;
  indexed_at: string | null;
  pages: ManualDetailPage[];
}

export interface ManualProcessingPage {
  page_number: number;
  ocr_status: 'pending' | 'completed' | 'failed';
  text_quality: 'ok' | 'empty' | 'low_confidence' | null;
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
      visibility?: 'private' | 'shared';
      language?: string;
      gameId: string;
    }
  | {
      title: string;
      pdf: File;
      visibility?: 'private' | 'shared';
      language?: string;
      gameId: string;
    };

export interface AnswerResponse {
  answer: string;
}

export const api = {
  /** GET /health — proxied to backend's /health (sin /api). */
  async health(): Promise<{ status: string }> {
    // /health vive fuera de /api en el backend; usamos path absoluto.
    const res = await fetch('/health', { credentials: 'same-origin' });
    if (!res.ok) {
      throw new ApiError(mapApiError({ status: res.status }), res.status, null);
    }
    return (await res.json()) as { status: string };
  },

  /** POST /api/ocr — extrae texto de una imagen. */
  async ocr(image: File, signal?: AbortSignal): Promise<OcrLinesResponse> {
    const fd = new FormData();
    fd.append('image', image);
    return request<OcrLinesResponse>('/ocr', {
      method: 'POST',
      body: fd,
      timeoutMs: 90_000,
      signal,
    });
  },

  /** POST /api/manuals: guarda la fuente y devuelve 202 mientras procesa. */
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
      timeoutMs: 90_000,
      signal,
    });
  },

  /** GET /api/games: busca juegos seleccionables para asociar el manual. */
  async searchGames(query: string, signal?: AbortSignal): Promise<GameSearchResponse> {
    return request<GameSearchResponse>(
      `/games?q=${encodeURIComponent(query)}&limit=5`,
      {
        method: 'GET',
        timeoutMs: 30_000,
        signal,
      },
    );
  },

  /** GET /api/manuals/{id}: detalle completo con paginas y lineas OCR. */
  async getManual(
    manualId: string,
    signal?: AbortSignal,
  ): Promise<ManualDetailResponse> {
    return request<ManualDetailResponse>(
      `/manuals/${encodeURIComponent(manualId)}`,
      {
        method: 'GET',
        timeoutMs: 30_000,
        signal,
      },
    );
  },

  /** GET /api/manuals/{id}/processing: progreso ligero para polling. */
  async getManualProcessing(
    manualId: string,
    signal?: AbortSignal,
  ): Promise<ManualProcessingResponse> {
    return request<ManualProcessingResponse>(
      `/manuals/${encodeURIComponent(manualId)}/processing`,
      {
        method: 'GET',
        timeoutMs: 30_000,
        signal,
      },
    );
  },

  /** POST /api/manuals/{id}/questions: pregunta sobre un manual ya indexado. */
  async askManual(
    manualId: string,
    question: string,
    signal?: AbortSignal,
  ): Promise<AnswerResponse> {
    return request<AnswerResponse>(`/manuals/${encodeURIComponent(manualId)}/questions`, {
      method: 'POST',
      body: JSON.stringify({ question }),
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 5 * 60_000,
      signal,
    });
  },
};
