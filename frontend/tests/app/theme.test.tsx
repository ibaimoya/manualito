import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/app/theme';

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.className = '';
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderTheme() {
  return renderHook(useTheme, { wrapper: ThemeProvider });
}

function advanceTime(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// jsdom no ejecuta CSS. Controlamos solo cuándo termina o se cancela una transición del navegador.
function createCssTransition() {
  const completion = Promise.withResolvers<Animation>();
  const animation = { finished: completion.promise, transitionProperty: '--m-bg' } as CSSTransition;
  return {
    animation,
    finish: () => completion.resolve(animation),
    cancel: () => completion.reject(new DOMException('Transición cancelada', 'AbortError')),
  };
}

describe('ThemeProvider', () => {
  it('inicia en light y amber y aplica el tema al documento', () => {
    const { result } = renderTheme();
    expect(result.current.mode).toBe('light');
    expect(result.current.accent).toBe('amber');
    expect(document.documentElement).toHaveClass('theme-light');
    expect(document.documentElement).not.toHaveClass('color-transition');
  });

  it('aplica dark inmediatamente y lo persiste tras la espera', () => {
    const { result } = renderTheme();
    act(() => result.current.setMode('dark'));
    expect(document.documentElement).toHaveClass('theme-dark');
    advanceTime(200);
    expect(JSON.parse(localStorage.getItem('manualito.settings')!)).toEqual({
      mode: 'dark',
      accent: 'amber',
    });
  });

  it('aplica el acento elegido y lo persiste', () => {
    const { result } = renderTheme();
    act(() => result.current.setAccent('blue'));
    expect(result.current.accent).toBe('blue');
    expect(document.documentElement).toHaveClass('accent-blue');
    advanceTime(200);
    expect(JSON.parse(localStorage.getItem('manualito.settings')!)).toEqual({
      mode: 'light',
      accent: 'blue',
    });
  });

  it('useTheme fuera de Provider lanza un error claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(useTheme)).toThrow(/useTheme/);
  });

  it('lee preferencias persistidas al montar', () => {
    localStorage.setItem('manualito.settings', JSON.stringify({ mode: 'dark', accent: 'blue' }));
    const { result } = renderTheme();
    expect(result.current.mode).toBe('dark');
    expect(result.current.accent).toBe('blue');
    expect(document.documentElement).toHaveClass('theme-dark', 'accent-blue');
    expect(document.documentElement).not.toHaveClass('color-transition');
  });

  it('mantiene la transición de tema hasta que acaba la animación del navegador', async () => {
    const transition = createCssTransition();
    let animations = [transition.animation];
    vi.spyOn(document.documentElement, 'getAnimations').mockImplementation(() => animations);
    const { result } = renderTheme();

    act(() => result.current.setMode('dark'));
    expect(document.documentElement).toHaveClass('theme-dark', 'color-transition');

    await act(async () => {
      animations = [];
      transition.finish();
    });
    expect(document.documentElement).not.toHaveClass('color-transition');
    expect(document.documentElement).toHaveClass('theme-dark');
  });

  it.each([
    { moment: 'antes del cambio de tema', alreadyRunning: true },
    { moment: 'durante el cambio de tema', alreadyRunning: false },
  ])(
    'limpia el color aunque otra animación empiece $moment y siga activa',
    async ({ alreadyRunning }) => {
      const transition = createCssTransition();
      const otherCompletion = Promise.withResolvers<Animation>();
      const otherAnimation = { finished: otherCompletion.promise } as Animation;
      let animations = alreadyRunning
        ? [transition.animation, otherAnimation]
        : [transition.animation];
      vi.spyOn(document.documentElement, 'getAnimations').mockImplementation(() => animations);
      const { result } = renderTheme();

      act(() => result.current.setMode('dark'));
      expect(document.documentElement).toHaveClass('color-transition');

      await act(async () => {
        animations = [otherAnimation];
        transition.finish();
      });
      expect(document.documentElement).toHaveClass('theme-dark');
      expect(document.documentElement).not.toHaveClass('color-transition');
      otherCompletion.resolve(otherAnimation);
    },
  );

  it('conserva el último tema y acento al interrumpir una transición anterior', async () => {
    const first = createCssTransition();
    const latest = createCssTransition();
    let animations = [first.animation];
    vi.spyOn(document.documentElement, 'getAnimations').mockImplementation(() => animations);
    const { result } = renderTheme();

    act(() => result.current.setMode('dark'));
    animations = [latest.animation];
    act(() => {
      result.current.setMode('light');
      result.current.setAccent('blue');
    });

    await act(async () => first.cancel());
    expect(document.documentElement).toHaveClass('theme-light', 'accent-blue', 'color-transition');
    expect(document.documentElement).not.toHaveClass('theme-dark');

    await act(async () => {
      animations = [];
      latest.finish();
    });
    expect(document.documentElement).not.toHaveClass('color-transition');
    expect(document.documentElement).toHaveClass('theme-light', 'accent-blue');
  });

  it('no corta el cambio de acento al elegir un modo con la misma paleta visible', async () => {
    const transition = createCssTransition();
    let animations = [transition.animation];
    vi.spyOn(document.documentElement, 'getAnimations').mockImplementation(() => animations);
    const { result } = renderTheme();

    act(() => result.current.setAccent('blue'));
    act(() => result.current.setMode('auto'));
    expect(result.current.mode).toBe('auto');
    expect(document.documentElement).toHaveClass('theme-light', 'accent-blue', 'color-transition');

    await act(async () => {
      animations = [];
      transition.finish();
    });
    expect(document.documentElement).not.toHaveClass('color-transition');
  });

  it('aplica el destino y limpia la transición si el navegador no crea animaciones', async () => {
    const { result } = renderTheme();

    await act(async () => result.current.setMode('dark'));

    expect(document.documentElement).toHaveClass('theme-dark');
    expect(document.documentElement).not.toHaveClass('color-transition');
  });

  it('usa los valores iniciales si las preferencias están corruptas', () => {
    localStorage.setItem('manualito.settings', '{[no valid json');
    const { result } = renderTheme();
    expect(result.current.mode).toBe('light');
    expect(result.current.accent).toBe('amber');
  });

  it('reinicia la espera entre cambios y escribe solo la última preferencia', () => {
    const { result } = renderTheme();
    advanceTime(200);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    act(() => result.current.setMode('dark'));
    advanceTime(50);
    act(() => result.current.setMode('light'));
    advanceTime(50);
    act(() => result.current.setMode('dark'));
    advanceTime(199);

    expect(setItem).not.toHaveBeenCalled();
    advanceTime(1);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      'manualito.settings',
      JSON.stringify({ mode: 'dark', accent: 'amber' }),
    );
  });

  it('repetir los valores actuales no provoca nuevas escrituras', () => {
    const { result } = renderTheme();
    advanceTime(200);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    act(() => result.current.setMode('light'));
    act(() => result.current.setAccent('amber'));
    advanceTime(200);

    expect(setItem).not.toHaveBeenCalled();
  });

  it('solo sigue el esquema del SO en modo auto y conserva el acento', () => {
    // El SO es una frontera externa: controlamos el cambio de su media query.
    let prefersDark = false;
    const listeners = new Set<() => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return query === '(prefers-color-scheme: dark)' && prefersDark;
          },
          media: query,
          onchange: null,
          addEventListener: (_: string, cb: () => void) => listeners.add(cb),
          removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );

    const { result } = renderTheme();
    act(() => result.current.setAccent('blue'));
    expect(listeners.size).toBe(0);

    act(() => result.current.setMode('auto'));
    expect(listeners.size).toBe(1);
    act(() => {
      prefersDark = true;
      for (const listener of listeners) listener();
    });
    expect(document.documentElement).toHaveClass('theme-dark', 'accent-blue');

    act(() => result.current.setMode('light'));
    expect(listeners.size).toBe(0);
    expect(document.documentElement).toHaveClass('theme-light', 'accent-blue');
  });
});
