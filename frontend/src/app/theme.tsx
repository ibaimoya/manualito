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
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { storage } from '@/shared/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type AccentVariant = 'amber' | 'blue';

type ThemeState = {
  mode: ThemeMode;
  accent: AccentVariant;
  setMode: (mode: ThemeMode) => void;
  setAccent: (a: AccentVariant) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

const PERSIST_DEBOUNCE_MS = 200;

type Persisted = { mode: ThemeMode; accent: AccentVariant };
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

function loadInitial(): Persisted {
  const { mode, accent } = storage.readSettings();
  return { mode, accent };
}

function persistTheme(state: Persisted): void {
  storage.writeSettings(state);
}

/**
 * Aplica los flags al `<html>` (clases) para que tokens.css reaccione.
 * `mode: 'auto'` consulta `prefers-color-scheme` cada vez que se llama.
 */
function applyToHtml(state: Persisted): void {
  const { document: runtimeDocument, window: runtimeWindow } = getBrowserRuntime();
  if (runtimeDocument === undefined || runtimeWindow === undefined) return;
  const root = runtimeDocument.documentElement;
  const prefersDark = runtimeWindow.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = state.mode === 'dark' || (state.mode === 'auto' && prefersDark);

  root.classList.toggle('theme-dark', dark);
  root.classList.toggle('theme-light', !dark);
  root.classList.toggle('accent-blue', state.accent === 'blue');
}

/**
 * Aplica el tema dentro de una View Transition (crossfade nativo, el spam se
 * cancela limpio). Sin soporte o con reduced-motion, aplica en seco.
 */
function applyWithViewTransition(state: Persisted): void {
  const { document: runtimeDocument, window: runtimeWindow } = getBrowserRuntime();
  if (runtimeDocument === undefined || runtimeWindow === undefined) return;
  const reduced = runtimeWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const docAny = runtimeDocument as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (reduced || typeof docAny.startViewTransition !== 'function') {
    applyToHtml(state);
    return;
  }
  docAny.startViewTransition(() => flushSync(() => applyToHtml(state)));
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<Persisted>(() => loadInitial());

  // useTransition: con spam de toggles React solo procesa el último click.
  const [, startTransition] = useTransition();

  // En el primer mount no hay estado "from": se aplica sin View Transition.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) {
      applyWithViewTransition(state);
    } else {
      applyToHtml(state);
      mountedRef.current = true;
    }
  }, [state]);

  // Debounce: una ráfaga de clicks acaba en un solo setItem.
  const persist = useDebouncedCallback(persistTheme, PERSIST_DEBOUNCE_MS);
  useEffect(() => {
    persist(state);
  }, [state, persist]);

  // Depende del state completo: un listener viejo revertiría el acento.
  useEffect(() => {
    const runtimeWindow = getBrowserRuntime().window;
    if (state.mode !== 'auto' || runtimeWindow === undefined) return;
    const media = runtimeWindow.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToHtml(state);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [state]);

  // Guard de igualdad: repetir el valor actual no dispara render.
  const setMode = useCallback(
    (mode: ThemeMode) =>
      startTransition(() => {
        setState((s) => (s.mode === mode ? s : { ...s, mode }));
      }),
    [],
  );
  const setAccent = useCallback(
    (accent: AccentVariant) =>
      startTransition(() => {
        setState((s) => (s.accent === accent ? s : { ...s, accent }));
      }),
    [],
  );

  const value: ThemeState = useMemo(
    () => ({
      ...state,
      setMode,
      setAccent,
    }),
    [state, setMode, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  }
  return ctx;
}
