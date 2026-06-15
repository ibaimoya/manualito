import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';

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
