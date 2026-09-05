import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRetypingTitle, useTypewriter } from '@/features/conversations/use-typewriter';

// jsdom no expone las preferencias del sistema. Motion se ejecuta sin simularlo.
function motionPreference() {
  let matches = false;
  const events = new EventTarget();
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
    media,
    get matches() {
      return matches;
    },
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  }));
  return (value: boolean) =>
    act(() => {
      matches = value;
      events.dispatchEvent(new Event('change'));
    });
}

afterEach(() => vi.restoreAllMocks());

describe('texto progresivo', () => {
  it('termina tras el remontaje de efectos de StrictMode', async () => {
    const text = 'Una respuesta completa';
    const { result } = renderHook(() => useTypewriter(text, true), { wrapper: StrictMode });
    expect(result.current.done).toBe(false);
    await waitFor(() => expect(result.current).toEqual({ shown: text, done: true }));
  });

  it('muestra el historial de inmediato y reinicia solo al recibir otro texto', async () => {
    const { result, rerender } = renderHook(({ text, animate }) => useTypewriter(text, animate), {
      initialProps: { text: 'Historial', animate: false },
    });
    expect(result.current).toEqual({ shown: 'Historial', done: true });
    rerender({ text: 'Respuesta nueva', animate: true });
    expect(result.current.shown).toBe('');
    await waitFor(() => expect(result.current).toEqual({ shown: 'Respuesta nueva', done: true }));
  });

  it('completa al reducir movimiento y no reproduce otra vez al desactivarlo', async () => {
    const reduceMotion = motionPreference();
    const text = 'La respuesta larga debe completarse al cambiar la preferencia del sistema.';
    const { result } = renderHook(() => useTypewriter(text, true));
    await waitFor(() => expect(result.current.shown.length).toBeGreaterThan(0));
    expect(result.current.done).toBe(false);
    reduceMotion(true);
    expect(result.current).toEqual({ shown: text, done: true });
    reduceMotion(false);
    expect(result.current).toEqual({ shown: text, done: true });
  });

  it('interrumpe el título desde su texto visible y conserva el último destino', async () => {
    const reduceMotion = motionPreference();
    const { result, rerender } = renderHook((title) => useRetypingTitle(title), {
      initialProps: 'Título original',
    });
    rerender('Segundo título');
    await waitFor(() => expect(result.current.length).toBeLessThan('Título original'.length));
    const interrupted = result.current;
    rerender('Tercero');
    await waitFor(() => expect(result.current).not.toBe(interrupted));
    expect(interrupted.startsWith(result.current)).toBe(true);
    reduceMotion(true);
    expect(result.current).toBe('Tercero');
    reduceMotion(false);
    expect(result.current).toBe('Tercero');
    rerender('Final');
    await waitFor(() => expect(result.current).toBe('Final'));
  });
});
