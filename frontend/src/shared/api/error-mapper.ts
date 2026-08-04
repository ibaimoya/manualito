import type { ParseKeys } from 'i18next';
import i18n from '@/app/i18n';

/**
 * Errores HTTP del backend → mensaje UI accionable. Espejo de
 * backend/api/exceptions.py: un código nuevo allí necesita su entrada aquí.
 */

export type ApiErrorSeverity = 'warning' | 'error' | 'info';

export interface ApiErrorView {
  /** Título corto para toast / heading de error screen. */
  title: string;
  /** Mensaje extendido con la causa probable. */
  message: string;
  /** Próximo paso sugerido al usuario. */
  hint?: string;
  /** Marcas para UI (ej. "se puede reintentar"). */
  retryable: boolean;
  severity: ApiErrorSeverity;
  /** Código original — útil para mostrar en footer de error screen. */
  code: string;
}

type ErrorsKey = ParseKeys<'errors'>;

type ErrorViewDefinition = Omit<ApiErrorView, 'code' | 'title' | 'message' | 'hint'> & {
  title: ErrorsKey;
  message: ErrorsKey;
  hint: ErrorsKey;
};

type ErrorViewOverride = Partial<ErrorViewDefinition>;

const TABLE: Record<number, ErrorViewDefinition> = {
  400: {
    title: 'http.400.title',
    message: 'http.400.message',
    hint: 'http.400.hint',
    retryable: true,
    severity: 'warning',
  },
  404: {
    title: 'http.404.title',
    message: 'http.404.message',
    hint: 'http.404.hint',
    retryable: false,
    severity: 'warning',
  },
  401: {
    title: 'http.401.title',
    message: 'http.401.message',
    hint: 'http.401.hint',
    retryable: false,
    severity: 'warning',
  },
  403: {
    title: 'http.403.title',
    message: 'http.403.message',
    hint: 'http.403.hint',
    retryable: true,
    severity: 'warning',
  },
  409: {
    title: 'http.409.title',
    message: 'http.409.message',
    hint: 'http.409.hint',
    retryable: false,
    severity: 'warning',
  },
  429: {
    title: 'http.429.title',
    message: 'http.429.message',
    hint: 'http.429.hint',
    retryable: true,
    severity: 'warning',
  },
  413: {
    title: 'http.413.title',
    message: 'http.413.message',
    hint: 'http.413.hint',
    retryable: true,
    severity: 'warning',
  },
  415: {
    title: 'http.415.title',
    message: 'http.415.message',
    hint: 'http.415.hint',
    retryable: true,
    severity: 'warning',
  },
  422: {
    title: 'http.422.title',
    message: 'http.422.message',
    hint: 'http.422.hint',
    retryable: true,
    severity: 'warning',
  },
  500: {
    title: 'http.500.title',
    message: 'http.500.message',
    hint: 'http.500.hint',
    retryable: true,
    severity: 'error',
  },
  502: {
    title: 'http.502.title',
    message: 'http.502.message',
    hint: 'http.502.hint',
    retryable: true,
    severity: 'warning',
  },
  503: {
    title: 'http.503.title',
    message: 'http.503.message',
    hint: 'http.503.hint',
    retryable: true,
    severity: 'warning',
  },
  504: {
    title: 'http.504.title',
    message: 'http.504.message',
    hint: 'http.504.hint',
    retryable: true,
    severity: 'warning',
  },
};

const CODE_OVERRIDES: Record<string, ErrorViewOverride> = {
  pdf_too_large: {
    title: 'code.pdfTooLarge.title',
    message: 'code.pdfTooLarge.message',
    hint: 'code.pdfTooLarge.hint',
  },
  manual_too_large: {
    title: 'code.manualTooLarge.title',
    message: 'code.manualTooLarge.message',
    hint: 'code.manualTooLarge.hint',
  },
  invalid_pdf: {
    title: 'code.invalidPdf.title',
    message: 'code.invalidPdf.message',
    hint: 'code.invalidPdf.hint',
  },
  game_not_found: {
    title: 'code.gameNotFound.title',
    message: 'code.gameNotFound.message',
    hint: 'code.gameNotFound.hint',
    retryable: false,
  },
  game_unavailable: {
    title: 'code.gameUnavailable.title',
    message: 'code.gameUnavailable.message',
    hint: 'code.gameUnavailable.hint',
    retryable: false,
  },
  no_manual_sources: {
    title: 'code.noManualSources.title',
    message: 'code.noManualSources.message',
    hint: 'code.noManualSources.hint',
    retryable: false,
  },
  manual_context_not_found: {
    title: 'code.manualContextNotFound.title',
    message: 'code.manualContextNotFound.message',
    hint: 'code.manualContextNotFound.hint',
  },
  manual_duplicate: {
    title: 'code.manualDuplicate.title',
    message: 'code.manualDuplicate.message',
    hint: 'code.manualDuplicate.hint',
    retryable: false,
  },
  identity_unavailable: {
    title: 'code.identityUnavailable.title',
    message: 'code.identityUnavailable.message',
    hint: 'code.identityUnavailable.hint',
    retryable: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function backendErrorCode(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw['errors'])) return null;
  const [first] = raw['errors'];
  if (!isRecord(first) || typeof first['code'] !== 'string') return null;
  return first['code'];
}

/* Error de campo estructurado, conserva prioridad porque trae informacion real */
function backendFieldMessage(raw: unknown): string | null {
  if (!isRecord(raw) || !Array.isArray(raw['errors'])) return null;
  const [first] = raw['errors'];
  if (isRecord(first) && typeof first['message'] === 'string') return first['message'];
  return null;
}

function backendDetailMessage(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  return typeof raw['detail'] === 'string' ? raw['detail'] : null;
}

const HTTP_4XX_FALLBACK: ErrorViewDefinition = {
  title: 'http.client.title',
  message: 'http.client.message',
  hint: 'http.client.hint',
  retryable: true,
  severity: 'warning',
};

const HTTP_5XX_FALLBACK: ErrorViewDefinition = {
  title: 'http.server.title',
  message: 'http.server.message',
  hint: 'http.server.hint',
  retryable: true,
  severity: 'error',
};

const NETWORK_ERROR_DEFINITION: ErrorViewDefinition = {
  title: 'network.title',
  message: 'network.message',
  hint: 'network.hint',
  retryable: true,
  severity: 'warning',
};

const UNKNOWN_ERROR_DEFINITION: ErrorViewDefinition = {
  title: 'unknown.title',
  message: 'unknown.message',
  hint: 'unknown.hint',
  retryable: true,
  severity: 'error',
};

function translateView(definition: ErrorViewDefinition, code: string): ApiErrorView {
  return {
    title: i18n.t(definition.title, { ns: 'errors' }),
    message: i18n.t(definition.message, { ns: 'errors' }),
    hint: i18n.t(definition.hint, { ns: 'errors' }),
    retryable: definition.retryable,
    severity: definition.severity,
    code,
  };
}

function translateOverride(override: ErrorViewOverride): Partial<Omit<ApiErrorView, 'code'>> {
  return {
    ...(override.title ? { title: i18n.t(override.title, { ns: 'errors' }) } : {}),
    ...(override.message ? { message: i18n.t(override.message, { ns: 'errors' }) } : {}),
    ...(override.hint ? { hint: i18n.t(override.hint, { ns: 'errors' }) } : {}),
    ...(override.retryable === undefined ? {} : { retryable: override.retryable }),
    ...(override.severity === undefined ? {} : { severity: override.severity }),
  };
}

function mapBackendError(status: number, raw: unknown): ApiErrorView {
  const code = backendErrorCode(raw);
  const override = code === null ? undefined : CODE_OVERRIDES[code];
  const fallback = mapHttpStatus(status, code ?? undefined);
  // Precedencia del message. override por codigo > error de campo > tabla > detail
  const hasLocalMapping = TABLE[status] !== undefined || override !== undefined;
  const backendMessage =
    override?.message !== undefined
      ? null
      : (backendFieldMessage(raw) ?? (hasLocalMapping ? null : backendDetailMessage(raw)));
  return {
    ...fallback,
    ...(override ? translateOverride(override) : {}),
    ...(backendMessage ? { message: backendMessage } : {}),
    code: code ?? fallback.code,
  };
}

export function mapHttpStatus(status: number, fallbackCode?: string): ApiErrorView {
  const entry = TABLE[status];
  if (entry) return translateView(entry, `http.${status}`);

  if (status >= 400 && status < 500) {
    return translateView(HTTP_4XX_FALLBACK, fallbackCode ?? `http.${status}`);
  }

  return translateView(HTTP_5XX_FALLBACK, fallbackCode ?? `http.${status}`);
}

/** Status de un error tipo axios ("error.response.status"); null si no aplica. */
function responseStatus(error: object): number | null {
  if (!('response' in error)) return null;
  const res = (error as { response?: { status?: number } }).response;
  return res && typeof res.status === 'number' ? res.status : null;
}

export function mapApiError(error: unknown): ApiErrorView {
  if (error instanceof TypeError) return translateView(NETWORK_ERROR_DEFINITION, 'network');
  if (typeof error !== 'object' || error === null) {
    return translateView(UNKNOWN_ERROR_DEFINITION, 'unknown');
  }

  // ApiError propio: status numérico + cuerpo crudo del backend.
  if ('status' in error && typeof error.status === 'number') {
    const raw = 'raw' in error ? error.raw : undefined;
    return mapBackendError(error.status, raw);
  }

  const status = responseStatus(error);
  return status === null
    ? translateView(UNKNOWN_ERROR_DEFINITION, 'unknown')
    : mapHttpStatus(status);
}
