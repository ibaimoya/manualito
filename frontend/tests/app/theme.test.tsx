import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { ThemeProvider, useTheme } from '@/app/theme';

type ThemeApi = ReturnType<typeof useTheme>;

function ThemeCapture({
  onCapture,
}: Readonly<{ onCapture: (api: ThemeApi) => void }>) {
  const api = useTheme();
  useEffect(() => {
    onCapture(api);
  }, [api, onCapture]);
  return null;
}

function ThemeProbe() {
  const t = useTheme();
  return (
    <div>
      <p data-testid="mode">{t.mode}</p>
      <p data-testid="accent">{t.accent}</p>
      <button onClick={() => t.setMode('dark')}>dark</button>
      <button onClick={() => t.setAccent('blue')}>blue</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('valor inicial: mode=light, accent=amber', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('light');
    expect(screen.getByTestId('accent').textContent).toBe('amber');
  });

  it('aplica clases CSS al <html> según el state', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    // Por defecto theme-light (matchMedia=false en jsdom).
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('cambiar a dark añade theme-dark y persiste en localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText('dark'));
    // El class del html se aplica inmediatamente (UI reactivo).
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    // El persist a localStorage es debounced 200ms para evitar spam de
    // writes — esperamos a que se materialice.
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('manualito.settings') ?? '{}');
      expect(stored.mode).toBe('dark');
    });
  });

  it('cambiar accent persiste y refleja en html', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await user.click(screen.getByText('blue'));
    expect(document.documentElement.classList.contains('accent-blue')).toBe(true);
    expect(screen.getByTestId('accent').textContent).toBe('blue');
  });

  it('useTheme fuera de Provider lanza error claro', () => {
    // Silencia el error de React en consola para este test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ThemeProbe />)).toThrow(/useTheme/);
    spy.mockRestore();
  });

  it('lee preferencias persistidas del localStorage al montar', () => {
    localStorage.setItem(
      'manualito.settings',
      JSON.stringify({ mode: 'dark', accent: 'blue' }),
    );
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(screen.getByTestId('accent').textContent).toBe('blue');
  });

  it('ignora estado corrupto y cae a defaults', () => {
    localStorage.setItem('manualito.settings', '{[no valid json');
    expect(() =>
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });

  it('act + setMode rerendera correctamente', () => {
    let api: ThemeApi | undefined;
    render(
      <ThemeProvider>
        <ThemeCapture onCapture={(value) => { api = value; }} />
      </ThemeProvider>,
    );
    act(() => api!.setMode('light'));
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  /* ============================================================
     Spam de toggles — robustez bajo clicks rápidos.
     ============================================================ */
  describe('robustez bajo spam', () => {
    it('20 setMode en cascada → UNA sola escritura a localStorage (debounce)', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      let api: ThemeApi | undefined;
      render(
        <ThemeProvider>
          <ThemeCapture onCapture={(value) => { api = value; }} />
        </ThemeProvider>,
      );

      setItemSpy.mockClear();

      act(() => {
        for (let i = 0; i < 20; i++) {
          api!.setMode(i % 2 === 0 ? 'dark' : 'light');
        }
      });

      await waitFor(() => expect(setItemSpy).toHaveBeenCalled(), { timeout: 1500 });

      // El debounce de 200ms colapsa los 20 cambios en como máximo 2
      // writes (el primero podría salir si hubo gap; en spam puro = 1).
      expect(setItemSpy.mock.calls.length).toBeLessThanOrEqual(2);
      const lastCall = setItemSpy.mock.calls[setItemSpy.mock.calls.length - 1];
      const payload = JSON.parse(lastCall?.[1] as string);
      expect(payload.mode).toBe('light'); // i=19 → impar → light

      setItemSpy.mockRestore();
    });

    it('setMode con el mismo valor reutiliza el mismo objeto de state (guard)', () => {
      // No medimos renders directamente (con useTransition de React 19 el
      // conteo es impredecible).  Verificamos el efecto observable:
      // localStorage no recibe writes nuevos si llamas setMode con el
      // valor actual.
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      let api: ThemeApi | undefined;
      render(
        <ThemeProvider>
          <ThemeCapture onCapture={(value) => { api = value; }} />
        </ThemeProvider>,
      );

      setItemSpy.mockClear();
      act(() => {
        for (let i = 0; i < 5; i++) api!.setMode('light');
      });

      // El default es 'light' → cinco setMode('light') no deben provocar
      // ninguna escritura porque el state no cambia.
      return waitFor(() => {
        expect(setItemSpy).not.toHaveBeenCalled();
        setItemSpy.mockRestore();
      });
    });

    it('fuera del modo auto no se abren suscripciones a prefers-color-scheme', () => {
      // En jsdom matchMedia es un shim definido en src/test/setup.ts; cada
      // llamada a window.matchMedia devuelve un MQL nuevo. Contamos las
      // invocaciones del query: en modo light solo las hace applyToHtml.
      const realMM = window.matchMedia.bind(window);
      const mmSpy = vi.spyOn(window, 'matchMedia').mockImplementation(realMM);

      let api: ThemeApi | undefined;
      render(
        <ThemeProvider>
          <ThemeCapture onCapture={(value) => { api = value; }} />
        </ThemeProvider>,
      );

      const initialCount = mmSpy.mock.calls.filter(
        ([q]) => q === '(prefers-color-scheme: dark)',
      ).length;

      act(() => {
        api!.setAccent('blue');
        api!.setAccent('amber');
        api!.setAccent('blue');
      });

      const afterCount = mmSpy.mock.calls.filter(
        ([q]) => q === '(prefers-color-scheme: dark)',
      ).length;

      expect(afterCount - initialCount).toBeLessThanOrEqual(3);
      mmSpy.mockRestore();
    });

    it('en modo auto, el cambio de esquema del SO conserva el acento elegido', () => {
      // Mock controlable: applyToHtml lee `matches` fresco en cada llamada
      // y el listener de 'auto' se registra aquí para poder dispararlo.
      let prefersDark = false;
      const listeners = new Set<() => void>();
      const mmSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            get matches() {
              return query === '(prefers-color-scheme: dark)' ? prefersDark : false;
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

      let api: ThemeApi | undefined;
      render(
        <ThemeProvider>
          <ThemeCapture onCapture={(value) => { api = value; }} />
        </ThemeProvider>,
      );

      act(() => api!.setMode('auto'));
      act(() => api!.setAccent('blue'));
      expect(document.documentElement.classList.contains('accent-blue')).toBe(true);

      // El SO pasa a oscuro: el listener debe aplicar el acento ACTUAL.
      act(() => {
        prefersDark = true;
        for (const cb of [...listeners]) cb();
      });
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
      expect(document.documentElement.classList.contains('accent-blue')).toBe(true);
      mmSpy.mockRestore();
    });

    it('persistir el tema no pisa otros campos de manualito.settings', async () => {
      localStorage.setItem(
        'manualito.settings',
        JSON.stringify({ mode: 'light', accent: 'amber', responseDetail: 'long' }),
      );
      let api: ThemeApi | undefined;
      render(
        <ThemeProvider>
          <ThemeCapture onCapture={(value) => { api = value; }} />
        </ThemeProvider>,
      );
      act(() => api!.setMode('dark'));

      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem('manualito.settings') ?? '{}');
        expect(stored.mode).toBe('dark');
        expect(stored.responseDetail).toBe('long');
      });
    });
  });
});
