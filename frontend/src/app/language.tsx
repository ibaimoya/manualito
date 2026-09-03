import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import i18n from '@/app/i18n';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { storage, type StoredLanguage } from '@/shared/lib/storage';
import './language.css';

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

function applyToHtml(language: Language): void {
  const runtimeDocument = globalThis.document;
  if (runtimeDocument === undefined) return;
  runtimeDocument.documentElement.lang = language;
  if (i18n.language !== language) void i18n.changeLanguage(language);
  runtimeDocument.title = i18n.t('shell:meta.title');
  runtimeDocument
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', i18n.t('shell:meta.description'));
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [language, setLanguageState] = useState<Language>(() => storage.readLanguage());
  const requestedLanguage = useRef(language);
  const transitionRef = useRef<ViewTransition | null>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const stopTransition = useCallback(() => {
    transitionRef.current?.skipTransition();
    transitionRef.current = null;
    globalThis.document?.documentElement.removeAttribute('data-language-snapshot');
  }, []);

  useLayoutEffect(() => {
    if (reducedMotion) stopTransition();
    applyToHtml(requestedLanguage.current);
    storage.writeLanguage(requestedLanguage.current);
  }, [reducedMotion, stopTransition]);

  useEffect(() => stopTransition, [stopTransition]);

  const setLanguage = useCallback(
    (next: Language) => {
      if (next === requestedLanguage.current) return;
      requestedLanguage.current = next;
      setLanguageState(next);
      storage.writeLanguage(next);

      const runtimeDocument = globalThis.document;
      stopTransition();
      if (reducedMotion || runtimeDocument?.visibilityState !== 'visible') {
        applyToHtml(next);
        return;
      }

      const transition = runtimeDocument.startViewTransition({
        types: ['language'],
        update: () => {
          // Solo se desvanece la captura anterior. El contenido nuevo sigue siendo interactivo.
          if (transitionRef.current === transition) {
            runtimeDocument.documentElement.setAttribute('data-language-snapshot', '');
          }
          flushSync(() => applyToHtml(requestedLanguage.current));
        },
      });
      transitionRef.current = transition;
      // Otra selección puede sustituir la captura antes de que empiece a animarse.
      void transition.ready.catch(() => undefined);
      void transition.finished.then(() => {
        if (transitionRef.current === transition) {
          transitionRef.current = null;
          runtimeDocument.documentElement.removeAttribute('data-language-snapshot');
        }
      });
    },
    [reducedMotion, stopTransition],
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
