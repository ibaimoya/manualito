import { z } from 'zod';

/**
 * Storage local para caches de UI y preferencias.
 *
 * Cada lectura se valida con Zod para tolerar cambios de schema o datos
 * tocados desde DevTools.
 */

const KEY = {
  manuals: 'manualito.manuals',
  // Clave legada del Q&A local; solo para limpiar restos de versiones viejas.
  qa: (manualId: string) => `manualito.qa.${manualId}`,
  settings: 'manualito.settings',
  onboardingSeen: 'manualito.onboarding.seen',
  manualResult: (manualId: string) => `manualito.result.${manualId}`,
  // Clave legada del cache OCR; solo para limpiar restos de versiones viejas.
  ocrLines: (manualId: string) => `manualito.ocr.${manualId}`,
} as const;

/* ============================================================
   Schemas
   ============================================================ */

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

const ManualRecordSchema = z.object({
  manual_id: z.string().min(1),
  name: z.string().min(1).max(120),
  created_at: IsoDateTimeSchema,
  last_opened_at: IsoDateTimeSchema,
  chunks_indexed: z.number().int().nonnegative(),
});
export type ManualRecord = z.infer<typeof ManualRecordSchema>;

const ManualsListSchema = z.array(ManualRecordSchema);

/** Shape de una línea de texto extraído (OCR o PDF). */
export interface OcrLine {
  text: string;
  confidence: number | null;
}

const ManualResultSchema = z.object({
  manual_id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string(),
  setup: z.string(),
  turn: z.string(),
  win: z.string(),
  /** Last filled "casos especiales" — opcional, se rellena bajo demanda. */
  special: z.string().optional(),
  created_at: IsoDateTimeSchema,
});
export type ManualResult = z.infer<typeof ManualResultSchema>;

const SettingsSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('light'),
  accent: z.enum(['amber', 'blue']).default('amber'),
  responseDetail: z.enum(['short', 'medium', 'long']).default('medium'),
});
// z.output: los defaults rellenan huecos y el tipo runtime va completo.
export type Settings = z.output<typeof SettingsSchema>;
const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

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
  /* Manuales recientes */
  listManuals(): ManualRecord[] {
    return safeRead(KEY.manuals, ManualsListSchema, [] as ManualRecord[]);
  },
  upsertManual(record: ManualRecord): void {
    const existing = storage.listManuals();
    const filtered = existing.filter((m) => m.manual_id !== record.manual_id);
    const next: ManualRecord[] = [record, ...filtered].slice(0, 100);
    safeWrite(KEY.manuals, next);
  },
  touchManual(manualId: string): void {
    const existing = storage.listManuals();
    const idx = existing.findIndex((m) => m.manual_id === manualId);
    if (idx < 0) return;
    const item = existing[idx];
    if (!item) return;
    const updated: ManualRecord = { ...item, last_opened_at: new Date().toISOString() };
    const next: ManualRecord[] = [updated, ...existing.filter((_, i) => i !== idx)];
    safeWrite(KEY.manuals, next);
  },
  removeManual(manualId: string): void {
    const next = storage.listManuals().filter((m) => m.manual_id !== manualId);
    safeWrite(KEY.manuals, next);
    safeRemove(KEY.qa(manualId));
    safeRemove(KEY.manualResult(manualId));
    safeRemove(KEY.ocrLines(manualId));
  },

  /* Resultado pre-generado de un manual (las 4 respuestas iniciales) */
  getResult(manualId: string): ManualResult | null {
    const fallback = null as ManualResult | null;
    const value = safeRead(
      KEY.manualResult(manualId),
      ManualResultSchema.nullable(),
      fallback,
    );
    return value;
  },
  setResult(result: ManualResult): void {
    safeWrite(KEY.manualResult(result.manual_id), result);
  },

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

  /* Wipe total (botón "borrar historial" en settings) */
  wipeAll(): void {
    const manuals = storage.listManuals();
    for (const m of manuals) {
      safeRemove(KEY.qa(m.manual_id));
      safeRemove(KEY.manualResult(m.manual_id));
      safeRemove(KEY.ocrLines(m.manual_id));
    }
    safeRemove(KEY.manuals);
  },
};

/* Re-export keys for tests */
export const STORAGE_KEYS = KEY;
