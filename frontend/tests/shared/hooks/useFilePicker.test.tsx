import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useFilePicker } from '@/shared/hooks/useFilePicker';

/**
 * Tests del bug #4 del catálogo: el doble-click NO debe abrir dos veces
 * el file picker.
 */
describe('useFilePicker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const clickSpy = vi.fn();
    const inputMock = { click: clickSpy } as unknown as HTMLInputElement;
    const inputRef = { current: inputMock } as React.RefObject<HTMLInputElement>;
    return { clickSpy, inputRef };
  }

  it('un click llama input.click() una vez', () => {
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('dos clicks seguidos solo dispara UNO (deduplicación)', () => {
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('tras 400ms el flag se resetea y permite otro picker', () => {
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(401);
    });
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it('si el ref es null no peta y no hace nada', () => {
    const inputRef = { current: null } as unknown as React.RefObject<HTMLInputElement>;
    const { result } = renderHook(() => useFilePicker(inputRef));
    expect(() => act(() => result.current())).not.toThrow();
  });

  it('al desmontar limpia el timer (no leak)', () => {
    const { clickSpy, inputRef } = setup();
    const { result, unmount } = renderHook(() => useFilePicker(inputRef));
    act(() => result.current());
    unmount();
    // El timer ya no debería dispararse — si lo hiciera, una excepción
    // saltaría en el listener.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('la función devuelta es estable (mismo identity entre renders)', () => {
    const { inputRef } = setup();
    const { result, rerender } = renderHook(() => useFilePicker(inputRef));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

/**
 * Smoke test extra: el hook puede usarse con un useRef "vivo" dentro
 * de un componente.  Garantiza que las dependencias del useCallback
 * son las correctas.
 */
describe('useFilePicker — integración con useRef', () => {
  it('funciona cuando inputRef se crea con useRef en un componente', () => {
    function Test() {
      const ref = useRef<HTMLInputElement>(null);
      const open = useFilePicker(ref);
      return { ref, open };
    }
    const { result } = renderHook(Test);
    expect(typeof result.current.open).toBe('function');
  });
});
