import { z } from 'zod';

const KEY = {
  settings: 'manualito.settings',
  language: 'manualito.language',
  onboardingSeen: 'manualito.onboarding.seen',
  conversationsSeen: 'manualito.conversations.seen',
} as const;

const SettingsSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('light'),
  accent: z.enum(['amber', 'blue']).default('amber'),
});
export type Settings = z.output<typeof SettingsSchema>;
const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

const LanguageSchema = z.enum(['es', 'en']);
export type StoredLanguage = z.output<typeof LanguageSchema>;
const DEFAULT_LANGUAGE: StoredLanguage = 'es';

// Marca de lectura por conversación: el último "updated_at" que el usuario vio
// al abrir el chat. Si el de la lista es más nuevo, hay respuesta sin leer.
const ConversationsSeenSchema = z.record(z.string(), z.string());
type ConversationsSeen = z.output<typeof ConversationsSeenSchema>;

function safeRead<S extends z.ZodTypeAny>(
  key: string,
  schema: S,
  fallback: z.output<S>,
): z.output<S> {
  try {
    const raw = globalThis.window?.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) return fallback;
    return result.data;
  } catch {
    return fallback;
  }
}

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

function safeWrite(key: string, value: unknown): void {
  try {
    globalThis.window?.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    const reason = classifyWriteError(err);
    for (const l of writeFailListeners) {
      try {
        l(reason, key);
      } catch {
        /* listener defectuoso, ignorar */
      }
    }
  }
}

export const storage = {
  readSettings(): Settings {
    return safeRead(KEY.settings, SettingsSchema, DEFAULT_SETTINGS);
  },
  writeSettings(settings: Settings): void {
    safeWrite(KEY.settings, settings);
  },

  readLanguage(): StoredLanguage {
    return safeRead(KEY.language, LanguageSchema, DEFAULT_LANGUAGE);
  },
  writeLanguage(language: StoredLanguage): void {
    safeWrite(KEY.language, language);
  },

  isOnboardingSeen(): boolean {
    try {
      return globalThis.window?.localStorage.getItem(KEY.onboardingSeen) === '1';
    } catch {
      return false;
    }
  },
  markOnboardingSeen(): void {
    try {
      globalThis.window?.localStorage.setItem(KEY.onboardingSeen, '1');
    } catch {
      /* noop */
    }
  },
  readConversationsSeen(): ConversationsSeen {
    return safeRead(KEY.conversationsSeen, ConversationsSeenSchema, {});
  },
  markConversationSeen(conversationId: string, updatedAt: string): void {
    const seen = safeRead(KEY.conversationsSeen, ConversationsSeenSchema, {});
    if (seen[conversationId] === updatedAt) return;
    safeWrite(KEY.conversationsSeen, { ...seen, [conversationId]: updatedAt });
  },
};

export const STORAGE_KEYS = KEY;
