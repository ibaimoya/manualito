import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
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

function getColorTransitions(root: HTMLElement) {
  return root
    .getAnimations()
    .filter((animation) =>
      (animation as Partial<CSSTransition>).transitionProperty?.startsWith('--m-'),
    );
}

function applyToHtml(state: Persisted): void {
  const { document: runtimeDocument, window: runtimeWindow } = globalThis;
  if (runtimeDocument === undefined || runtimeWindow === undefined) return;
  const root = runtimeDocument.documentElement;
  const prefersDark = runtimeWindow.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = state.mode === 'dark' || (state.mode === 'auto' && prefersDark);
  const blue = state.accent === 'blue';
  const sameTheme = root.classList.contains(dark ? 'theme-dark' : 'theme-light');
  const hasTheme = root.classList.contains('theme-dark') || root.classList.contains('theme-light');
  const sameAccent = root.classList.contains('accent-blue') === blue;

  if (hasTheme && (!sameTheme || !sameAccent)) root.classList.add('color-transition');
  root.classList.toggle('theme-dark', dark);
  root.classList.toggle('theme-light', !dark);
  root.classList.toggle('accent-blue', blue);

  if (root.classList.contains('color-transition')) {
    void Promise.allSettled(getColorTransitions(root).map((animation) => animation.finished)).then(
      () => {
        if (getColorTransitions(root).length === 0) root.classList.remove('color-transition');
      },
    );
  }
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState(storage.readSettings);

  useLayoutEffect(() => {
    applyToHtml(state);
  }, [state]);

  // Debounce: una ráfaga de clicks acaba en un solo setItem.
  const persist = useDebouncedCallback(storage.writeSettings, PERSIST_DEBOUNCE_MS);
  useEffect(() => {
    persist(state);
  }, [state, persist]);

  // Depende del state completo: un listener viejo revertiría el acento.
  useEffect(() => {
    const runtimeWindow = globalThis.window;
    if (state.mode !== 'auto' || runtimeWindow === undefined) return;
    const media = runtimeWindow.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToHtml(state);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [state]);

  const setMode = useCallback(
    (mode: ThemeMode) =>
      setState((current) => (current.mode === mode ? current : { ...current, mode })),
    [],
  );
  const setAccent = useCallback(
    (accent: AccentVariant) =>
      setState((current) => (current.accent === accent ? current : { ...current, accent })),
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
