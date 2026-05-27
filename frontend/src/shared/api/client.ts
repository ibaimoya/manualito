import { mapApiError, type ApiErrorView } from './error-mapper';

/**
 * Cliente HTTP minimal.  Construido a mano (no axios) para:
 *   - Mantener el bundle pequeño (la PWA va a móvil).
 *   - No depender de codegen para los 5 endpoints iniciales.
 *   - Que `@hey-api/openapi-ts` pueda generar después sin chocar.
 *
 * Convenciones:
 *   - baseUrl `/api` → relativo, lo resuelve vite proxy (dev) o nginx (prod).
 *   - timeout configurable (POST /manuals tarda ~30-60s).
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
   Endpoints reales del backend FastAPI (mayo 2026)
   ============================================================ */

export interface OcrLine {
  text: string;
  confidence: number;
}

export interface OcrLinesResponse {
  lines: OcrLine[];
}

export interface ManualCreatedResponse {
  manual_id: string;
  chunks_indexed: number;
  status: string;
  /**
   * Líneas OCR extraídas por el gateway durante la indexación.
   * El frontend las guarda en `localStorage` para que la pantalla
   * "Ver texto original" pueda mostrarlas sin volver a llamar al OCR.
   *
   * El backend siempre devuelve este campo (lista vacía si el OCR no
   * encontró texto).  El tipo no es opcional aquí porque la respuesta
   * del API ya garantiza su presencia.
   */
  ocr_lines: OcrLine[];
}

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
      signal: signal ?? new AbortController().signal,
    });
  },

  /**
   * POST /api/manuals — crea + indexa el manual.
   * Tarda 30-60s en máquinas con GPU; en CPU puede llegar a 5-10 min.
   */
  async createManual(
    name: string,
    image: File,
    signal?: AbortSignal,
  ): Promise<ManualCreatedResponse> {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('image', image);
    return request<ManualCreatedResponse>('/manuals', {
      method: 'POST',
      body: fd,
      timeoutMs: 10 * 60_000,
      signal: signal ?? new AbortController().signal,
    });
  },

  /** POST /api/manuals/{id}/questions — pregunta sobre un manual ya indexado. */
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
      signal: signal ?? new AbortController().signal,
    });
  },
};
