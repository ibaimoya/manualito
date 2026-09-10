import { StrictMode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoverySymbol } from '@/shared/components/recovery/RecoverySymbol';
import type { RecoveryKind } from '@/shared/components/recovery/RecoveryContent';

function systemMotion() {
  // Solo sustituimos la preferencia del sistema que jsdom no implementa.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches: true,
    media: '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (reduced: boolean) =>
    act(() => {
      media.matches = !reduced;
      media.dispatchEvent(new Event('change'));
    });
}

function renderSymbol(kind: RecoveryKind = 'error') {
  const view = render(<RecoverySymbol kind={kind} retrying={false} />, { wrapper: StrictMode });
  const host = view.container.firstElementChild as HTMLDivElement;
  const parts = Array.from(host.querySelectorAll<SVGElement>('[data-recovery-gesture]'));
  const part = parts[0];
  if (!part) throw new Error('No se ha montado el símbolo animado');
  return { ...view, host, parts, part };
}

function nextFrame() {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

function enter(host: HTMLElement) {
  fireEvent.pointerEnter(host, { pointerType: 'mouse' });
}

function leave(host: HTMLElement) {
  fireEvent.pointerLeave(host, { pointerType: 'mouse' });
}

afterEach(() => vi.restoreAllMocks());

describe('RecoverySymbol con Motion real', () => {
  it('anima la exclamación con el círculo fijo y retoma el gesto durante el regreso', async () => {
    systemMotion();
    const { host, part: alert } = renderSymbol();
    const circle = host.querySelector('circle');
    expect(circle).not.toBeNull();
    await nextFrame();
    const rest = alert.style.transform;
    enter(host);
    await nextFrame();
    await nextFrame();
    const firstMovement = alert.style.transform;
    expect(firstMovement).not.toBe(rest);
    const displacement = Number(firstMovement.match(/translateY\(([-\d.]+)px\)/)?.[1]);
    expect(displacement).toBeLessThan(0);
    expect(displacement).toBeGreaterThan(-1);
    expect(firstMovement).toMatch(/scale\(1,\s*1\)/);
    expect(alert.contains(circle)).toBe(false);
    expect(circle).not.toHaveAttribute('style');

    leave(host);
    const interrupted = alert.style.transform;
    enter(host);
    expect(alert.style.transform).not.toBe(rest);
    await waitFor(() => expect(alert.style.transform).not.toBe(interrupted));
    leave(host);
    await waitFor(() => expect(alert.style.transform).toBe(rest));
    await nextFrame();
    expect(alert.style.transform).toBe(rest);
  });

  it('reanima las tres ondas de conexión y las asienta al salir', async () => {
    systemMotion();
    const { host, parts } = renderSymbol('offline');
    expect(parts).toHaveLength(3);
    await nextFrame();
    const resting = parts.map((part) => part.style.transform);
    enter(host);
    await waitFor(() => {
      for (const part of parts) expect(Number(part.style.opacity)).toBeLessThan(1);
    });
    leave(host);
    await waitFor(() => {
      expect(parts.map((part) => part.style.transform)).toEqual(resting);
      for (const part of parts) expect(part.style.opacity).toBe('1');
    });
    enter(host);
    await waitFor(() => {
      for (const part of parts) expect(Number(part.style.opacity)).toBeLessThan(1);
    });
  });

  it('detiene el movimiento en caliente y espera una nueva entrada al restaurarlo', async () => {
    const reduce = systemMotion();
    const { host, part: alert } = renderSymbol();
    await nextFrame();
    const rest = alert.style.transform;
    enter(host);
    await waitFor(() => expect(alert.style.transform).not.toBe(rest));
    reduce(true);
    await waitFor(() => expect(alert.style.transform).toBe(rest));
    leave(host);
    enter(host);
    await nextFrame();
    await nextFrame();
    expect(alert.style.transform).toBe(rest);

    reduce(false);
    await nextFrame();
    expect(alert.style.transform).toBe(rest);
    leave(host);
    enter(host);
    await waitFor(() => expect(alert.style.transform).not.toBe(rest));
  });

  it('no acepta gestos mientras se reintenta y los recupera al terminar', async () => {
    systemMotion();
    const { host, part: alert, rerender } = renderSymbol();
    await nextFrame();
    const rest = alert.style.transform;
    enter(host);
    await waitFor(() => expect(alert.style.transform).not.toBe(rest));
    rerender(<RecoverySymbol kind="error" retrying />);
    await waitFor(() => expect(alert.style.transform).toBe(rest));
    leave(host);
    enter(host);
    await nextFrame();
    await nextFrame();
    expect(alert.style.transform).toBe(rest);

    rerender(<RecoverySymbol kind="error" retrying={false} />);
    await nextFrame();
    expect(alert.style.transform).toBe(rest);
    leave(host);
    enter(host);
    await waitFor(() => expect(alert.style.transform).not.toBe(rest));
  });
});
