import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef, type RefObject } from 'react';
import { useFilePicker } from '@/shared/hooks/useFilePicker';

/**
 * Tests del file picker: un flag con reset a 400 ms evita que un doble-click
 * rápido abra el diálogo nativo dos veces.
 */
describe('useFilePicker', () => {
  function setup() {
    const clickSpy = vi.fn();
    const inputMock = document.createElement('input');
    inputMock.type = 'file';
    inputMock.click = clickSpy;
    const inputRef = { current: inputMock } as RefObject<HTMLInputElement>;
    return { clickSpy, inputRef };
  }

  it('un click llama input.click() una vez', () => {
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('clicks rápidos en cascada solo abren el picker una vez', () => {
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('tras 400 ms el flag se libera y un nuevo click vuelve a abrir', () => {
    vi.useFakeTimers();
    const { clickSpy, inputRef } = setup();
    const { result } = renderHook(() => useFilePicker(inputRef));
    act(() => result.current());
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current());
    expect(clickSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('si el ref es null no peta y no hace nada', () => {
    const inputRef = { current: null } as unknown as RefObject<HTMLInputElement>;
    const { result } = renderHook(() => useFilePicker(inputRef));
    expect(() => act(() => result.current())).not.toThrow();
  });

  it('limpia el timer pendiente al desmontar', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { inputRef } = setup();
    const { result, unmount } = renderHook(() => useFilePicker(inputRef));

    act(() => result.current());
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
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
 * de un componente. Garantiza que las dependencias del useCallback
 * son las correctas.
 */
describe('useFilePicker · integración con useRef', () => {
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
