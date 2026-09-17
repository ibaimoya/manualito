import { mapApiError, type ApiErrorView } from './error-mapper';

/**
 * Núcleo de transporte HTTP: "request"/"requestVoid" (fetch con timeout, CSRF y
 * mapeo de errores) y "ApiError". Lo reutilizan los módulos por recurso
 * ("./client", "./auth", "./conversations").
 */

const DEFAULT_TIMEOUT_MS = 180_000;

/** Timeouts por familia de endpoint (generosos: OCR + RAG + LLM tardan). */
export const TIMEOUT = {
  /** Lecturas y mutaciones ligeras. */
  QUICK: 30_000,
  /** Registro/login (hash Argon2id). */
  AUTH: 60_000,
  /** Subidas multipart: 30 imágenes de hasta 30 MB y 95 MB por manual o PDF. */
  UPLOAD: 600_000,
  /** Generación con el LLM. */
  LLM: 300_000,
} as const;

const BASE_URL = '/api';

/** Cabeceras para cuerpos JSON — compartidas por los módulos por recurso. */
export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export class ApiError extends Error {
  public readonly status: number | undefined;
  public readonly raw: unknown;

  constructor(status: number | undefined, raw: unknown) {
    super(mapApiError({ status, raw }).message);
    this.name = 'ApiError';
    this.status = status;
    this.raw = raw;
  }

  get view(): ApiErrorView {
    return mapApiError(this);
  }
}

export function isAbortApiError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return (
    error instanceof ApiError &&
    error.raw instanceof DOMException &&
    error.raw.name === 'AbortError'
  );
}

// CSRF double-submit: la cookie legible viaja en X-CSRF-Token (nombres en api/config.py).
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_COOKIE_NAMES = ['__Host-manualito_csrf', 'manualito_csrf'] as const;
const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null; // sin DOM no hay cookies
  const cookieJar = document.cookie;
  if (!cookieJar) return null;
  const values = new Map<string, string>();
  for (const entry of cookieJar.split('; ')) {
    const [name, ...rest] = entry.split('=');
    if (name) values.set(name, rest.join('='));
  }
  for (const name of CSRF_COOKIE_NAMES) {
    const value = values.get(name);
    if (value !== undefined) return decodeURIComponent(value);
  }
  return null;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: BodyInit;
  /** Cabeceras adicionales — el Content-Type lo gestiona el body. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Cabeceras de la petición + token CSRF reflejado en mutaciones. */
function buildHeaders(
  method: string,
  base: Record<string, string> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { ...base };
  if (MUTATING_METHODS.has(method) && !hasHeader(headers, CSRF_HEADER_NAME)) {
    const token = readCsrfCookie();
    if (token !== null) headers[CSRF_HEADER_NAME] = token;
  }
  return headers;
}

/** Cuerpo del error como JSON o, si falla, texto. */
async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

/** Normaliza cualquier excepción de red/timeout a "ApiError". */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ApiError(504, err);
  }
  return new ApiError(undefined, err);
}

async function executeRequest<T>(
  path: string,
  opts: RequestOptions,
  readResponse: (response: Response) => Promise<T>,
): Promise<T> {
  const url = path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
  const method = opts.method ?? 'GET';
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method,
      body: opts.body,
      headers: buildHeaders(method, opts.headers),
      signal: opts.signal ? AbortSignal.any([opts.signal, controller.signal]) : controller.signal,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const raw = await readErrorBody(response);
      throw new ApiError(response.status, raw);
    }
    return await readResponse(response);
  } catch (err) {
    throw toApiError(err);
  } finally {
    clearTimeout(timer);
  }
}

/** Parsea el cuerpo de una respuesta OK con contenido (JSON o texto plano). */
async function parseBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data: T = await response.json();
    return data;
  }
  return (await response.text()) as unknown as T;
}

/** Petición con cuerpo tipado (endpoints que devuelven JSON). */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return executeRequest(path, opts, parseBody<T>);
}

/** Mutación sin cuerpo de respuesta (204): logout, borrados. */
export async function requestVoid(path: string, opts: RequestOptions = {}): Promise<void> {
  await executeRequest(path, opts, async () => undefined);
}

/** Query-string ("?a=1&b=2") omitiendo null/undefined; vacío si no hay params. */
export function queryString(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}
