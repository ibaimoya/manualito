import { z } from 'zod';

/**
 * Storage local para caches de UI y preferencias.
 *
 * Cada lectura se valida con Zod para tolerar cambios de schema o datos
 * tocados desde DevTools.
 */

const KEY = {
  manuals: 'manualito.manuals',
  qa: (manualId: string) => `manualito.qa.${manualId}`,
  qaIndex: 'manualito.qa-index',
  settings: 'manualito.settings',
  onboardingSeen: 'manualito.onboarding.seen',
  manualResult: (manualId: string) => `manualito.result.${manualId}`,
  // Cache opcional para texto original cuando un flujo ya lo tenga resuelto.
  ocrLines: (manualId: string) => `manualito.ocr.${manualId}`,
} as const;

/* ============================================================
   Schemas
   ============================================================ */

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const ManualRecordSchema = z.object({
  manual_id: z.string().min(1),
  name: z.string().min(1).max(120),
  created_at: IsoDateTimeSchema,
  last_opened_at: IsoDateTimeSchema,
  chunks_indexed: z.number().int().nonnegative(),
});
export type ManualRecord = z.infer<typeof ManualRecordSchema>;

const ManualsListSchema = z.array(ManualRecordSchema);

export const QAMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'bot', 'system']),
  text: z.string(),
  ts: IsoDateTimeSchema,
});
export type QAMessage = z.infer<typeof QAMessageSchema>;
const QAListSchema = z.array(QAMessageSchema);

/** Shape local para texto OCR cacheado por el frontend. */
export const OcrLineSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
});
export type OcrLine = z.infer<typeof OcrLineSchema>;
const OcrLinesSchema = z.array(OcrLineSchema);

export const ManualResultSchema = z.object({
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

export const SettingsSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('auto'),
  density: z.enum(['compact', 'comfy']).default('comfy'),
  accent: z.enum(['amber', 'blue']).default('amber'),
  responseDetail: z.enum(['short', 'medium', 'long']).default('medium'),
});
// z.infer da el tipo INPUT (campos opcionales); z.output da el OUTPUT (campos requeridos
// porque los defaults llenan los huecos). Para uso runtime queremos el output.
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
 * Listener global de fallos de escritura — UI (capture/chat/home) puede
 * suscribirse para mostrar un toast "Espacio local agotado" cuando la
 * quota se haya agotado.  Catálogo bug #12.
 *
 * Implementado como pub/sub minimal sin librería extra; el wrapper lo
 * dispara en cada fallo y la UI decide cómo notificar.
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

  /* Texto OCR cacheado cuando algun flujo lo proporciona. */
  getOcrLines(manualId: string): OcrLine[] {
    return safeRead(KEY.ocrLines(manualId), OcrLinesSchema, [] as OcrLine[]);
  },
  setOcrLines(manualId: string, lines: OcrLine[]): void {
    safeWrite(KEY.ocrLines(manualId), lines);
  },

  /* Historial Q&A por manual */
  listQA(manualId: string): QAMessage[] {
    return safeRead(KEY.qa(manualId), QAListSchema, [] as QAMessage[]);
  },
  appendQA(manualId: string, msg: QAMessage): void {
    const next = [...storage.listQA(manualId), msg];
    safeWrite(KEY.qa(manualId), next);
  },
  clearQA(manualId: string): void {
    safeRemove(KEY.qa(manualId));
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
