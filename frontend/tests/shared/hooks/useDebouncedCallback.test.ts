import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useDebouncedCallback,
  useDebouncedCallbackWithFlush,
} from '@/shared/hooks/useDebouncedCallback';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedCallback', () => {
  it('llama UNA sola vez aunque se invoque N veces dentro del delay', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(spy, 200));

    act(() => {
      result.current('a');
      result.current('b');
      result.current('c');
    });

    // Aún no — todavía dentro del delay.
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Solo la última llamada (con argumento "c") se aplica.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('cada nueva llamada reinicia el timer', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(spy, 200));

    act(() => result.current('a'));
    act(() => vi.advanceTimersByTime(150));
    // 150ms transcurridos — aún no dispara.
    expect(spy).not.toHaveBeenCalled();

    act(() => result.current('b'));
    act(() => vi.advanceTimersByTime(150));
    // 150ms desde "b" — el timer se reinició, sigue sin disparar.
    expect(spy).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60));
    // Ahora sí (50ms reales + 60ms = 210ms desde "b").
    expect(spy).toHaveBeenCalledWith('b');
  });

  it('usa la versión más reciente de fn (closure fresco)', () => {
    let current = vi.fn();
    const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, 100), {
      initialProps: { fn: current },
    });

    act(() => result.current('a'));
    const newer = vi.fn();
    current = newer;
    rerender({ fn: newer });

    act(() => vi.advanceTimersByTime(100));

    expect(newer).toHaveBeenCalledWith('a');
  });

  it('al desmontar limpia el timer (no leak ni callback post-unmount)', () => {
    const spy = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 200));
    act(() => result.current('x'));
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(spy).not.toHaveBeenCalled();
  });

  it('devuelve una función estable entre renders', () => {
    const spy = vi.fn();
    const { result, rerender } = renderHook(() => useDebouncedCallback(spy, 200));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useDebouncedCallbackWithFlush', () => {
  it('flush() ejecuta inmediato la pendiente y cancela el timer', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallbackWithFlush(spy, 500));

    act(() => result.current.debounced('value'));
    expect(spy).not.toHaveBeenCalled();

    act(() => result.current.flush());
    expect(spy).toHaveBeenCalledWith('value');

    // El timer ya no debería dispararse otra vez.
    act(() => vi.advanceTimersByTime(500));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('flush() sin llamada previa no hace nada', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallbackWithFlush(spy, 100));
    act(() => result.current.flush());
    expect(spy).not.toHaveBeenCalled();
  });

  it('debounced con dos llamadas consecutivas: la 2ª cancela el timer de la 1ª', () => {
    // Cubre la rama "timerRef.current !== null → clearTimeout antes de
    // crear el nuevo timer" dentro de debounced (líneas 107-108 del fichero).
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallbackWithFlush(spy, 300));

    act(() => result.current.debounced('first'));
    act(() => vi.advanceTimersByTime(150));
    act(() => result.current.debounced('second'));
    act(() => vi.advanceTimersByTime(300));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('second');
  });

  it('cuando el timer expira, ejecuta latestRef + limpia pendingArgsRef', () => {
    // Cubre las líneas 110-114: dentro del setTimeout, leer pendingArgsRef,
    // llamar latestRef, anular pendingArgsRef, anular timerRef.
    const spy = vi.fn();
    const { result } = renderHook(() => useDebouncedCallbackWithFlush(spy, 100));

    act(() => result.current.debounced('value'));
    act(() => vi.advanceTimersByTime(100));
    expect(spy).toHaveBeenCalledWith('value');

    // Tras la ejecución, un flush() no debería re-disparar (pendingArgsRef nulo).
    act(() => result.current.flush());
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('al desmontar con timer pendiente limpia (no leak)', () => {
    // Cubre el effect cleanup (líneas 82-90) cuando hay timer activo.
    const spy = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallbackWithFlush(spy, 200));

    act(() => result.current.debounced('x'));
    unmount();
    act(() => vi.advanceTimersByTime(500));

    expect(spy).not.toHaveBeenCalled();
  });
});
