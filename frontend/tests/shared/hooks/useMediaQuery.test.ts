import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  MEDIA_QUERIES,
  readMediaSnapshot,
  useMediaQuery,
  useNamedMediaQuery,
} from '@/shared/hooks/useMediaQuery';

/**
 * Mock matchMedia controlable: cada test puede definir qué queries
 * matchean y dispara eventos de cambio cuando quiera.
 */
type Listener = (e: { matches: boolean; media: string }) => void;

interface MockMql {
  matches: boolean;
  media: string;
  listeners: Set<Listener>;
  addEventListener: (type: 'change', l: Listener) => void;
  removeEventListener: (type: 'change', l: Listener) => void;
  dispatch: (matches: boolean) => void;
}

const registry = new Map<string, MockMql>();

function makeMql(query: string, initial: boolean): MockMql {
  const mql: MockMql = {
    matches: initial,
    media: query,
    listeners: new Set(),
    addEventListener(_type, l) {
      this.listeners.add(l);
    },
    removeEventListener(_type, l) {
      this.listeners.delete(l);
    },
    dispatch(matches) {
      this.matches = matches;
      for (const l of this.listeners) l({ matches, media: query });
    },
  };
  registry.set(query, mql);
  return mql;
}

function installMatchMedia(defaults: Record<string, boolean> = {}): void {
  registry.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => {
    const cached = registry.get(q);
    if (cached) return cached as unknown as MediaQueryList;
    return makeMql(q, defaults[q] ?? false) as unknown as MediaQueryList;
  });
}

function trigger(query: string, matches: boolean): void {
  const m = registry.get(query);
  if (!m) throw new Error(`Query "${query}" not registered yet`);
  act(() => m.dispatch(matches));
}

beforeEach(() => {
  installMatchMedia();
});

afterEach(() => {
  vi.restoreAllMocks();
  registry.clear();
});

describe('useMediaQuery', () => {
  it('devuelve el valor inicial de matchMedia sin parpadeo', () => {
    installMatchMedia({ '(min-width: 800px)': true });
    const { result } = renderHook(() => useMediaQuery('(min-width: 800px)'));
    expect(result.current).toBe(true);
  });

  it('reactiona a cambios del media query (dispatch change)', () => {
    installMatchMedia({ '(min-width: 800px)': false });
    const { result } = renderHook(() => useMediaQuery('(min-width: 800px)'));
    expect(result.current).toBe(false);
    trigger('(min-width: 800px)', true);
    expect(result.current).toBe(true);
    trigger('(min-width: 800px)', false);
    expect(result.current).toBe(false);
  });

  it('limpia el listener al desmontar', () => {
    installMatchMedia({ '(min-width: 800px)': true });
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 800px)'));
    const mql = registry.get('(min-width: 800px)')!;
    expect(mql.listeners.size).toBeGreaterThan(0);
    unmount();
    expect(mql.listeners.size).toBe(0);
  });

});

describe('queries semánticas', () => {
  it('centraliza los literales de media query', () => {
    expect(MEDIA_QUERIES).toEqual({
      desktop: '(min-width: 768px)',
      darkMode: '(prefers-color-scheme: dark)',
    });
  });

  it('useNamedMediaQuery usa desktop y reacciona a cambios', () => {
    installMatchMedia({ [MEDIA_QUERIES.desktop]: true });
    const { result } = renderHook(() => useNamedMediaQuery('desktop'));
    expect(result.current).toBe(true);
    trigger(MEDIA_QUERIES.desktop, false);
    expect(result.current).toBe(false);
  });

  it('useNamedMediaQuery("darkMode") lee prefers-color-scheme', () => {
    installMatchMedia({ [MEDIA_QUERIES.darkMode]: true });
    const { result } = renderHook(() => useNamedMediaQuery('darkMode'));
    expect(result.current).toBe(true);
  });
});

describe('readMediaSnapshot', () => {
  it('devuelve el valor sin reactividad', () => {
    installMatchMedia({ '(min-width: 999px)': true });
    expect(readMediaSnapshot('(min-width: 999px)')).toBe(true);
    expect(readMediaSnapshot('(min-width: 1000000px)')).toBe(false);
  });
});

describe('readMediaSnapshot — sin window (SSR-safe)', () => {
  it('devuelve false cuando window es undefined', () => {
    // En jsdom window siempre existe, así que mockeamos `globalThis.window`
    // temporalmente a undefined para probar el fallback SSR.
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    });
    try {
      expect(readMediaSnapshot('(min-width: 1px)')).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
