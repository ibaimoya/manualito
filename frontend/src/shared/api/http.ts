import { mapApiError, type ApiErrorView } from './error-mapper';

/**
 * Núcleo de transporte HTTP: `request`/`requestVoid` (fetch con timeout, CSRF y
 * mapeo de errores) y `ApiError`. Lo reutilizan los módulos por recurso
 * (`./client`, `./auth`, `./conversations`).
 */

const DEFAULT_TIMEOUT_MS = 180_000;

/** Timeouts por familia de endpoint (generosos: OCR + RAG + LLM tardan). */
export const TIMEOUT = {
  /** Lecturas y mutaciones ligeras. */
  QUICK: 30_000,
  /** Registro/login (hash Argon2id). */
  AUTH: 60_000,
  /** Subidas multipart (hasta 10 imágenes o PDF de 50 MB). */
  UPLOAD: 180_000,
  /** Generación con el LLM. */
  LLM: 300_000,
} as const;

const BASE_URL = '/api';

/** Cabeceras para cuerpos JSON — compartidas por los módulos por recurso. */
export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

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

// CSRF double-submit: reflejamos la cookie legible en X-CSRF-Token en cada
// mutación. Nombre según entorno (api/config.py): dev `manualito_csrf`,
// prod `__Host-manualito_csrf`.
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

/** Une un AbortSignal externo al controlador interno (timeout). */
function linkExternalSignal(controller: AbortController, external: AbortSignal | undefined): void {
  if (!external) return;
  external.addEventListener('abort', () => controller.abort(external.reason), { once: true });
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

/** Normaliza cualquier excepción de red/timeout a `ApiError`. */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ApiError(mapApiError({ status: 504 }), 504, err);
  }
  return new ApiError(mapApiError(err), undefined, err);
}

/** fetch con timeout + CSRF + traducción de errores. Devuelve la respuesta OK. */
async function executeRequest(path: string, opts: RequestOptions): Promise<Response> {
  const url = path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
  const method = opts.method ?? 'GET';
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  linkExternalSignal(controller, opts.signal);

  try {
    const response = await fetch(url, {
      method,
      body: opts.body,
      headers: buildHeaders(method, opts.headers),
      signal: controller.signal,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const raw = await readErrorBody(response);
      throw new ApiError(mapApiError({ status: response.status, raw }), response.status, raw);
    }
    return response;
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
  const response = await executeRequest(path, opts);
  return parseBody<T>(response);
}

/** Mutación sin cuerpo de respuesta (204): logout, borrados. */
export async function requestVoid(path: string, opts: RequestOptions = {}): Promise<void> {
  await executeRequest(path, opts);
}

/** Query-string (`?a=1&b=2`) omitiendo null/undefined; vacío si no hay params. */
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
