import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { flushSync } from 'react-dom';
import i18n from '@/app/i18n';
import { storage, type StoredLanguage } from '@/shared/lib/storage';

export type Language = StoredLanguage;

/* Los nombres de idioma se muestran siempre en su forma nativa */
export const LANGUAGE_NAMES: Record<Language, string> = {
  es: 'Español',
  en: 'English',
};

type LanguageState = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageState | null>(null);

type BrowserRuntime = {
  document?: Document;
  window?: Window;
};

function getBrowserRuntime(): BrowserRuntime {
  return {
    document: globalThis.document,
    window: globalThis.window,
  };
}

function applyToHtml(language: Language): void {
  const runtimeDocument = getBrowserRuntime().document;
  if (runtimeDocument === undefined) return;
  runtimeDocument.documentElement.lang = language;
  // Dentro del flushSync de la View Transition, el crossfade captura el texto nuevo
  if (i18n.language !== language) void i18n.changeLanguage(language);
  runtimeDocument.title = i18n.t('shell:meta.title');
  runtimeDocument
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', i18n.t('shell:meta.description'));
}

/* Sin soporte o con reduced-motion aplica en seco */
function applyWithViewTransition(language: Language): void {
  const { document: runtimeDocument, window: runtimeWindow } = getBrowserRuntime();
  if (runtimeDocument === undefined || runtimeWindow === undefined) return;
  const reduced = runtimeWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const docAny = runtimeDocument as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (reduced || typeof docAny.startViewTransition !== 'function') {
    applyToHtml(language);
    return;
  }
  docAny.startViewTransition(() => flushSync(() => applyToHtml(language)));
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [language, setLanguageState] = useState<Language>(() => storage.readLanguage());

  // useTransition, con spam de cambios React solo procesa el último
  const [, startTransition] = useTransition();

  // En el primer mount no hay estado "from", se aplica sin View Transition
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) {
      applyWithViewTransition(language);
    } else {
      applyToHtml(language);
      mountedRef.current = true;
    }
    storage.writeLanguage(language);
  }, [language]);

  // Guard de igualdad, repetir el idioma actual no dispara render
  const setLanguage = useCallback(
    (next: Language) =>
      startTransition(() => {
        setLanguageState((current) => (current === next ? current : next));
      }),
    [],
  );

  const value: LanguageState = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage debe usarse dentro de <LanguageProvider>');
  }
  return ctx;
}
