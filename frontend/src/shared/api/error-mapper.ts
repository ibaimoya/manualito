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

const TABLE: Record<number, Omit<ApiErrorView, 'code'>> = {
  400: {
    title: 'Petición inválida',
    message: 'Algo en la petición no era correcto.',
    hint: 'Revisa los datos y vuelve a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  404: {
    title: 'Manual no encontrado',
    message: 'Este manual ya no existe en el servidor.',
    hint: 'Vuelve a la pantalla principal y sube las fotos otra vez.',
    retryable: false,
    severity: 'warning',
  },
  401: {
    title: 'Sesión caducada',
    message: 'Tu sesión ha expirado o no has iniciado sesión.',
    hint: 'Vuelve a entrar para continuar.',
    retryable: false,
    severity: 'warning',
  },
  403: {
    title: 'Acción no permitida',
    message: 'No tienes permiso para esta acción o el token de seguridad caducó.',
    hint: 'Recarga la página y vuelve a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  409: {
    title: 'Dato no disponible',
    message: 'Ese dato ya está en uso o no está disponible.',
    hint: 'Revisa los datos e inténtalo de nuevo.',
    retryable: false,
    severity: 'warning',
  },
  429: {
    title: 'Demasiados intentos',
    message: 'Has hecho demasiadas peticiones en poco tiempo.',
    hint: 'Espera un momento antes de volver a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  413: {
    title: 'Foto demasiado grande',
    message: 'La foto pesa más de 30 MB.',
    hint: 'Hazla con menos resolución o usa un editor para reducirla.',
    retryable: true,
    severity: 'warning',
  },
  415: {
    title: 'Formato no soportado',
    message: 'El fichero no es una imagen válida (JPG, PNG) ni PDF.',
    hint: 'Convierte el fichero y vuelve a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  422: {
    title: 'No conseguimos leer el manual',
    message: 'No se ha podido extraer texto de las páginas.',
    hint: 'Comprueba que las fotos estén enfocadas y con buena luz, y vuelve a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  500: {
    title: 'Algo ha fallado',
    message: 'Ha ocurrido un error interno en el servidor.',
    hint: 'Inténtalo de nuevo. Si persiste, repórtanos el código de error.',
    retryable: true,
    severity: 'error',
  },
  502: {
    title: 'Servicio cargando',
    message: 'Un servicio interno aún se está iniciando o no está disponible.',
    hint: 'Espera unos segundos y vuelve a intentarlo.',
    retryable: true,
    severity: 'warning',
  },
  503: {
    title: 'Servicio no disponible',
    message: 'El servidor está temporalmente fuera de servicio.',
    hint: 'Vuelve a intentarlo en un momento.',
    retryable: true,
    severity: 'warning',
  },
  504: {
    title: 'Tiempo de espera agotado',
    message: 'La respuesta tardó más de lo esperado.',
    hint: 'Inténtalo de nuevo o prueba con menos páginas.',
    retryable: true,
    severity: 'warning',
  },
};

const CODE_OVERRIDES: Record<string, Partial<Omit<ApiErrorView, 'code'>>> = {
  pdf_too_large: {
    title: 'PDF demasiado grande',
    message: 'El PDF puede ocupar como máximo 200 MB.',
    hint: 'Reduce el PDF o divide el manual en un archivo más pequeño.',
  },
  invalid_pdf: {
    title: 'PDF no válido',
    message: 'El archivo no es un PDF válido.',
    hint: 'Exporta el manual de nuevo como PDF y vuelve a intentarlo.',
  },
  game_not_found: {
    title: 'Juego no encontrado',
    message: 'El juego seleccionado ya no existe en el catálogo.',
    hint: 'Busca el juego otra vez y vuelve a asociar el manual.',
    retryable: false,
  },
  game_unavailable: {
    title: 'Juego no disponible',
    message: 'Este juego ya no está disponible para nuevas preguntas.',
    hint: 'Vuelve al catálogo y selecciona otro juego.',
    retryable: false,
  },
  no_manual_sources: {
    title: 'Fuente no disponible',
    message:
      'Una fuente que usaste ya no está disponible, así que no se pueden hacer nuevas preguntas en esta conversación.',
    hint: 'Sube de nuevo el manual del juego para volver a preguntar.',
    retryable: false,
  },
  manual_context_not_found: {
    title: 'Sin contexto suficiente',
    message: 'No hay manuales indexados disponibles para responder sobre ese juego.',
    hint: 'Espera a que termine el procesamiento o sube un manual válido.',
  },
  manual_duplicate: {
    title: 'Manual duplicado',
    message: 'Ese manual ya está en tu biblioteca para este juego.',
    hint: 'Abre el manual existente o sube una versión distinta.',
    retryable: false,
  },
  identity_unavailable: {
    title: 'Email o usuario no disponible',
    message: 'Ya existe una cuenta con ese email o nombre de usuario.',
    hint: 'Inicia sesión o prueba con otro nombre de usuario.',
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

function backendErrorMessage(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (Array.isArray(raw['errors'])) {
    const [first] = raw['errors'];
    if (isRecord(first) && typeof first['message'] === 'string') return first['message'];
  }
  return typeof raw['detail'] === 'string' ? raw['detail'] : null;
}

function mapBackendError(status: number, raw: unknown): ApiErrorView {
  const code = backendErrorCode(raw);
  if (code === null) {
    const fallback = mapHttpStatus(status);
    const message = backendErrorMessage(raw);
    return message ? { ...fallback, message } : fallback;
  }

  const fallback = mapHttpStatus(status, code);
  const override = CODE_OVERRIDES[code] ?? {};
  return {
    ...fallback,
    ...override,
    message: override.message ?? backendErrorMessage(raw) ?? fallback.message,
    code,
  };
}

export function mapHttpStatus(status: number, fallbackCode?: string): ApiErrorView {
  const entry = TABLE[status];
  if (entry) return { ...entry, code: `http.${status}` };

  if (status >= 400 && status < 500) {
    return {
      title: 'Petición rechazada',
      message: 'El servidor ha rechazado la petición.',
      hint: 'Inténtalo de nuevo.',
      retryable: true,
      severity: 'warning',
      code: fallbackCode ?? `http.${status}`,
    };
  }

  return {
    title: 'Error del servidor',
    message: 'Ha ocurrido un error inesperado.',
    hint: 'Inténtalo de nuevo en unos segundos.',
    retryable: true,
    severity: 'error',
    code: fallbackCode ?? `http.${status}`,
  };
}

const NETWORK_ERROR_VIEW: ApiErrorView = {
  title: 'Sin conexión',
  message: 'No hemos podido contactar con el servidor.',
  hint: 'Comprueba tu conexión a internet y vuelve a intentarlo.',
  retryable: true,
  severity: 'warning',
  code: 'network',
};

const UNKNOWN_ERROR_VIEW: ApiErrorView = {
  title: 'Error inesperado',
  message: 'Ha ocurrido algo que no esperábamos.',
  hint: 'Recarga la página o vuelve a intentarlo.',
  retryable: true,
  severity: 'error',
  code: 'unknown',
};

/** Status de un error tipo axios ("error.response.status"); null si no aplica. */
function responseStatus(error: object): number | null {
  if (!('response' in error)) return null;
  const res = (error as { response?: { status?: number } }).response;
  return res && typeof res.status === 'number' ? res.status : null;
}

export function mapApiError(error: unknown): ApiErrorView {
  if (error instanceof TypeError) return NETWORK_ERROR_VIEW;
  if (typeof error !== 'object' || error === null) return UNKNOWN_ERROR_VIEW;

  // ApiError propio: status numérico + cuerpo crudo del backend.
  if ('status' in error && typeof error.status === 'number') {
    const raw = 'raw' in error ? error.raw : undefined;
    return mapBackendError(error.status, raw);
  }

  const status = responseStatus(error);
  return status === null ? UNKNOWN_ERROR_VIEW : mapHttpStatus(status);
}
