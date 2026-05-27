import { z } from 'zod';

/**
 * Wrapper alrededor de `localStorage` con validación Zod.
 *
 * Backend de Manualito todavía no persiste lista de manuales, conversaciones
 * ni preferencias (ver `frontend/BACKEND_TODO.md`).  Mientras tanto, el
 * frontend mantiene el estado en este storage local y revalida cada lectura
 * con Zod para sobrevivir a:
 *   - corrupción manual del usuario en DevTools,
 *   - cambios de schema entre versiones del frontend (campos nuevos),
 *   - lecturas desde otro navegador/perfil.
 *
 * Pattern: cada slot expone `read()`, `write(value)` y `clear()`.  Las claves
 * llevan prefijo `manualito.` para no chocar con otras apps en el mismo origen.
 */

const KEY = {
  manuals: 'manualito.manuals',
  qa: (manualId: string) => `manualito.qa.${manualId}`,
  qaIndex: 'manualito.qa-index',
  settings: 'manualito.settings',
  onboardingSeen: 'manualito.onboarding.seen',
  manualResult: (manualId: string) => `manualito.result.${manualId}`,
  // Slot dedicado para las líneas OCR (texto + confidence por línea) que
  // el backend devuelve en POST /api/manuals.  Lo mantenemos separado del
  // ManualResult para poder leerlo aunque la generación LLM de las
  // explicaciones falle, y para no inflar la lista resumida de manuales.
  ocrLines: (manualId: string) => `manualito.ocr.${manualId}`,
} as const;

/* ============================================================
   Schemas
   ============================================================ */

export const ManualRecordSchema = z.object({
  manual_id: z.string().min(1),
  name: z.string().min(1).max(120),
  created_at: z.string().datetime({ offset: true }),
  last_opened_at: z.string().datetime({ offset: true }),
  chunks_indexed: z.number().int().nonnegative(),
});
export type ManualRecord = z.infer<typeof ManualRecordSchema>;

const ManualsListSchema = z.array(ManualRecordSchema);

export const QAMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'bot', 'system']),
  text: z.string(),
  ts: z.string().datetime({ offset: true }),
});
export type QAMessage = z.infer<typeof QAMessageSchema>;
const QAListSchema = z.array(QAMessageSchema);

/**
 * Línea OCR persistida en localStorage.  Mismo shape que devuelve el
 * backend en POST /api/manuals.ocr_lines y POST /api/ocr.lines.
 *
 * `confidence` viene en rango [0, 1] del motor OCR (Tesseract/PaddleOCR);
 * el viewer usa esos valores para colorear cada línea (verde/ámbar/rojo).
 */
export const OcrLineSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
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
  created_at: z.string().datetime({ offset: true }),
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

function safeRead<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) return fallback;
    return result.data as z.output<S>;
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
  if (err instanceof DOMException) {
    if (err.name === 'QuotaExceededError' || err.code === 22) return 'quota';
    if (err.name === 'SecurityError') return 'denied';
  }
  return 'unknown';
}

function safeWrite<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
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
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
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

  /* Líneas OCR de un manual — texto + confidence devuelto por backend.
     Se guarda al crear el manual y se consulta desde el viewer "Ver
     texto original" del Result. */
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
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(KEY.onboardingSeen) === '1';
    } catch {
      return false;
    }
  },
  markOnboardingSeen(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(KEY.onboardingSeen, '1');
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
