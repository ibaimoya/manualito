import i18n from '@/app/i18n';
import messages from '@/locales/es/errors.json';

export type ApiErrorSeverity = 'warning' | 'error' | 'info';

export interface ApiErrorView {
  title: string;
  message: string;
  hint?: string;
  retryable: boolean;
  severity: ApiErrorSeverity;
  code: string;
}

type ErrorCode = keyof typeof messages.code;
type HttpKey = keyof typeof messages.http;
type CopyKey = `code.${ErrorCode}` | `http.${HttpKey}` | 'network' | 'unknown';
type ErrorParams = { min?: number; max?: number };

const REQUIRED_LIMITS: Partial<Record<ErrorCode, keyof ErrorParams>> = {
  password_too_short: 'min',
  image_too_large: 'max',
  pdf_too_large: 'max',
  manual_too_large: 'max',
  manual_too_many_pages: 'max',
  email_too_long: 'max',
  username_too_long: 'max',
  password_too_long: 'max',
  message_too_long: 'max',
  title_too_long: 'max',
  text_too_long: 'max',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function translateView(key: CopyKey, params: ErrorParams = {}) {
  return {
    title: i18n.t(`${key}.title`, { ns: 'errors' }),
    message: i18n.t(`${key}.message`, { ns: 'errors', ...params }),
    hint: i18n.t(`${key}.hint`, { ns: 'errors', ...params }),
  };
}

export function mapHttpStatus(status: number, code = `http.${status}`): ApiErrorView {
  const statusKey = String(status);
  let key: HttpKey = status >= 400 && status < 500 ? 'client' : 'server';
  if (Object.hasOwn(messages.http, statusKey)) key = statusKey as HttpKey;

  return {
    ...translateView(`http.${key}`),
    retryable: ![401, 404, 409].includes(status),
    severity: status >= 500 && ![502, 503, 504].includes(status) ? 'error' : 'warning',
    code,
  };
}

function errorParams(raw: unknown): ErrorParams {
  if (!isRecord(raw)) return {};
  const params: ErrorParams = {};
  for (const key of ['min', 'max'] as const) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) params[key] = value;
  }
  return params;
}

function firstBackendError(raw: unknown): { code: string; params: unknown } | null {
  if (!isRecord(raw) || !Array.isArray(raw['errors'])) return null;
  const first = raw['errors'][0];
  if (!isRecord(first) || typeof first['code'] !== 'string') return null;
  return { code: first['code'], params: first['params'] };
}

function mapBackendError(status: number, raw: unknown): ApiErrorView {
  const error = firstBackendError(raw);
  const fallback = mapHttpStatus(status, error?.code);
  if (!error || !Object.hasOwn(messages.code, error.code)) return fallback;

  const params = errorParams(error.params);
  const knownCode = error.code as ErrorCode;
  const requiredLimit = REQUIRED_LIMITS[knownCode];
  if (requiredLimit && params[requiredLimit] === undefined) return fallback;

  return {
    ...fallback,
    ...translateView(`code.${knownCode}`, params),
    retryable:
      knownCode === 'manual_busy' || knownCode === 'manual_context_not_found' || fallback.retryable,
  };
}

export function mapApiError(error: unknown): ApiErrorView {
  if (isRecord(error) && typeof error['status'] === 'number') {
    return mapBackendError(error['status'], error['raw']);
  }

  const cause = isRecord(error) && 'raw' in error ? error['raw'] : error;
  const key = cause instanceof TypeError ? 'network' : 'unknown';
  return {
    ...translateView(key),
    retryable: true,
    severity: key === 'network' ? 'warning' : 'error',
    code: key,
  };
}
