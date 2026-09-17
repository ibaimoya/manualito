import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useFlagSweep } from '@/features/language/useFlagSweep';

function FlagSweepHost() {
  const sweepRef = useFlagSweep<HTMLDivElement>();
  return (
    <div ref={sweepRef}>
      <span data-flag-mix="" />
    </div>
  );
}

function renderSweep() {
  const { container, unmount } = render(<FlagSweepHost />);
  const host = container.firstElementChild;
  const mix = host?.querySelector<HTMLElement>('[data-flag-mix]');
  if (!(host instanceof HTMLElement) || !mix) throw new Error('No se ha montado el barrido');

  const animate = vi.fn<HTMLElement['animate']>(
    () => ({ cancel: vi.fn() }) as unknown as Animation,
  );
  Object.defineProperty(mix, 'animate', { configurable: true, value: animate });
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
  return { animate, host, unmount };
}

function enterFrom(host: HTMLElement, clientX: number): void {
  fireEvent(host, new MouseEvent('mouseenter', { bubbles: true, clientX }));
}

function secondKeyframe(animate: ReturnType<typeof renderSweep>['animate']) {
  const keyframes = animate.mock.calls[0]?.[0];
  return Array.isArray(keyframes) ? keyframes[1] : undefined;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFlagSweep', () => {
  beforeEach(() => {
    // jsdom no detecta las capacidades del puntero ni las preferencias del sistema.
    const media = globalThis.matchMedia('');
    vi.spyOn(globalThis, 'matchMedia').mockReturnValue({ ...media, matches: true });
  });

  it('empuja el barrido a la derecha al entrar por la izquierda', () => {
    const { animate, host } = renderSweep();

    enterFrom(host, 10);

    expect(animate).toHaveBeenCalledOnce();
    expect(secondKeyframe(animate)).toMatchObject({ '--flag-s': 0.98 });
  });

  it('empuja el barrido a la izquierda al entrar por la derecha', () => {
    const { animate, host } = renderSweep();

    enterFrom(host, 90);

    expect(animate).toHaveBeenCalledOnce();
    expect(secondKeyframe(animate)).toMatchObject({ '--flag-s': -0.98 });
  });

  it('mantiene el lado previo cuando la bandera ya está desplazada', () => {
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: vi.fn(() => '0.5'),
    } as unknown as CSSStyleDeclaration);
    const { animate, host } = renderSweep();

    enterFrom(host, 90);

    expect(animate).toHaveBeenCalledOnce();
    expect(secondKeyframe(animate)).toMatchObject({ '--flag-s': 0.98 });
  });

  it('no anima cuando el dispositivo o sus preferencias no permiten hover animado', () => {
    const media = globalThis.matchMedia('');
    vi.mocked(globalThis.matchMedia).mockReturnValue({ ...media, matches: false });
    const { animate, host } = renderSweep();

    enterFrom(host, 10);

    expect(animate).not.toHaveBeenCalled();
  });

  it('cancela el barrido en caliente, evita el retorno y limpia el listener al desmontar', () => {
    // EventTarget representa los avisos del sistema que jsdom no implementa.
    const media = Object.assign(new EventTarget(), { matches: true, media: 'hover' });
    const remove = vi.spyOn(media, 'removeEventListener');
    vi.mocked(globalThis.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
    const { animate, host, unmount } = renderSweep();
    enterFrom(host, 10);
    const animation = animate.mock.results[0]!.value as Animation;

    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event('change'));
    });
    expect(animation.cancel).toHaveBeenCalledOnce();
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '0.5',
    } as unknown as CSSStyleDeclaration);
    fireEvent.mouseLeave(host);
    enterFrom(host, 10);
    expect(animate).toHaveBeenCalledOnce();

    unmount();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
