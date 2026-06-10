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

export type ThemeMode = 'light' | 'dark' | 'auto';
export type AccentVariant = 'amber' | 'blue';

type ThemeState = {
  mode: ThemeMode;
  accent: AccentVariant;
  setMode: (mode: ThemeMode) => void;
  setAccent: (a: AccentVariant) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

const STORAGE_KEY = 'manualito.settings';
const PERSIST_DEBOUNCE_MS = 200;

type Persisted = { mode: ThemeMode; accent: AccentVariant };
type BrowserRuntime = {
  document?: Document;
  window?: Window;
};

const DEFAULT_PERSISTED: Persisted = { mode: 'light', accent: 'amber' };

function getBrowserRuntime(): BrowserRuntime {
  return {
    document: globalThis.document,
    window: globalThis.window,
  };
}

function loadFromStorage(): Persisted {
  const runtimeWindow = getBrowserRuntime().window;
  if (runtimeWindow === undefined) return DEFAULT_PERSISTED;
  try {
    const raw = runtimeWindow.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERSISTED;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      mode: parsed.mode ?? 'light',
      accent: parsed.accent ?? 'amber',
    };
  } catch {
    return DEFAULT_PERSISTED;
  }
}

function rawPersist(state: Persisted): void {
  const runtimeWindow = getBrowserRuntime().window;
  if (runtimeWindow === undefined) return;
  try {
    runtimeWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / privacidad — el listener global de storage avisa al usuario */
  }
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
 * Aplica el tema dentro de `document.startViewTransition`: el cambio masivo
 * de variables CSS se anima como crossfade nativo y las llamadas solapadas
 * se cancelan limpiamente (spam-click sin flicker). Sin soporte o con
 * reduced-motion, aplica en seco.
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
  const [state, setState] = useState<Persisted>(() => loadFromStorage());

  // `useTransition` marca los setState como "no urgentes": si llega otro
  // click rápido, React tira el render pendiente y solo procesa el último.
  // Evita main-thread saturado al spammear toggles.
  const [, startTransition] = useTransition();

  // Aplicación al DOM: side-effect del state.  En el PRIMER mount NO
  // queremos View Transition (no hay "from" estado anterior).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) {
      applyWithViewTransition(state);
    } else {
      applyToHtml(state);
      mountedRef.current = true;
    }
  }, [state]);

  // Persistencia con debounce: 20 clicks en 1s = UN solo setItem al final.
  // Mantiene el UI reactivo (state se actualiza al instante) pero evita
  // el lag de spam de writes síncronos a localStorage.
  const persist = useDebouncedCallback(rawPersist, PERSIST_DEBOUNCE_MS);
  useEffect(() => {
    persist(state);
  }, [state, persist]);

  // Listener de matchMedia para modo 'auto': re-suscribe SOLO cuando el
  // modo cambia, no cuando cambia el color de acento.
  useEffect(() => {
    const runtimeWindow = getBrowserRuntime().window;
    if (state.mode !== 'auto' || runtimeWindow === undefined) return;
    const media = runtimeWindow.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToHtml(state);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
    // Dep intencional: solo nos importa el modo aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode]);

  // Setters con guard de equidad: si el valor pedido == valor actual,
  // no disparamos setState (evita render extra cuando el usuario hace
  // doble-click sobre el mismo segmento del SegmentedControl).
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
