import { z } from 'zod';

/**
 * Storage local para preferencias de UI.
 *
 * Cada lectura se valida con Zod para tolerar cambios de schema o datos
 * tocados desde DevTools. Los datos de manuales viven en el backend; las
 * claves por manual de versiones viejas solo se conservan para limpiarlas.
 */

const KEY = {
  settings: 'manualito.settings',
  onboardingSeen: 'manualito.onboarding.seen',
  explainedAnimated: 'manualito.explained.animated',
} as const;

// Restos de cuando los manuales y sus respuestas se cacheaban en local.
const LEGACY_KEY = 'manualito.manuals';
const LEGACY_PREFIXES = ['manualito.qa.', 'manualito.result.', 'manualito.ocr.'];

/* ============================================================
   Schemas
   ============================================================ */

const SettingsSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('light'),
  accent: z.enum(['amber', 'blue']).default('amber'),
});
// z.output: los defaults rellenan huecos y el tipo runtime va completo.
export type Settings = z.output<typeof SettingsSchema>;
const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

// Tokens `juego:apartado` cuya animación de tecleo ya vio el usuario.
const ExplainedAnimatedSchema = z.array(z.string());

/* ============================================================
   Low-level safe accessors
   ============================================================ */

function getLocalStorage(): Storage | null {
  const runtimeWindow = globalThis.window;
  if (runtimeWindow === undefined) return null;
  return runtimeWindow.localStorage;
}

function safeRead<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  const localStorage = getLocalStorage();
  if (!localStorage) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) return fallback;
    return result.data;
  } catch {
    return fallback;
  }
}

/**
 * Pub/sub mínimo de fallos de escritura: el wrapper avisa y la UI decide
 * cómo notificar (p. ej. el toast de cuota agotada de Providers).
 */
type WriteFailReason = 'quota' | 'unknown' | 'denied';
type WriteFailListener = (reason: WriteFailReason, key: string) => void;
const writeFailListeners = new Set<WriteFailListener>();

export function onStorageWriteFail(l: WriteFailListener): () => void {
  writeFailListeners.add(l);
  return () => writeFailListeners.delete(l);
}

function classifyWriteError(err: unknown): WriteFailReason {
  const RuntimeDOMException = globalThis.DOMException;
  if (RuntimeDOMException !== undefined && err instanceof RuntimeDOMException) {
    if (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return 'quota';
    }
    if (err.name === 'SecurityError') return 'denied';
  }
  return 'unknown';
}

function safeWrite<T>(key: string, value: T): boolean {
  const localStorage = getLocalStorage();
  if (!localStorage) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    const reason = classifyWriteError(err);
    for (const l of writeFailListeners) {
      try {
        l(reason, key);
      } catch {
        /* listener defectuoso, ignorar */
      }
    }
    return false;
  }
}

function safeRemove(key: string): void {
  const localStorage = getLocalStorage();
  if (!localStorage) return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/* ============================================================
   Public API
   ============================================================ */

export const storage = {
  /* Preferencias */
  readSettings(): Settings {
    return safeRead(KEY.settings, SettingsSchema, DEFAULT_SETTINGS);
  },
  writeSettings(settings: Settings): void {
    safeWrite(KEY.settings, settings);
  },

  /* Onboarding seen flag */
  isOnboardingSeen(): boolean {
    const localStorage = getLocalStorage();
    if (!localStorage) return false;
    try {
      return localStorage.getItem(KEY.onboardingSeen) === '1';
    } catch {
      return false;
    }
  },
  markOnboardingSeen(): void {
    const localStorage = getLocalStorage();
    if (!localStorage) return;
    try {
      localStorage.setItem(KEY.onboardingSeen, '1');
    } catch {
      /* noop */
    }
  },
  resetOnboarding(): void {
    safeRemove(KEY.onboardingSeen);
  },

  /* Animación de tecleo de la explicación: una vez por apartado y juego */
  hasExplanationAnimated(token: string): boolean {
    return safeRead(KEY.explainedAnimated, ExplainedAnimatedSchema, []).includes(token);
  },
  markExplanationAnimated(token: string): void {
    const seen = safeRead(KEY.explainedAnimated, ExplainedAnimatedSchema, []);
    if (seen.includes(token)) return;
    safeWrite(KEY.explainedAnimated, [...seen, token]);
  },

  /* Barrido de claves legadas (botón "Borrar datos locales" en settings) */
  wipeAll(): void {
    const localStorage = getLocalStorage();
    if (!localStorage) return;
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null) continue;
      if (key === LEGACY_KEY || LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) safeRemove(key);
  },
};

/* Re-export keys for tests */
export const STORAGE_KEYS = KEY;
