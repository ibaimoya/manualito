import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
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
  const { container } = render(<FlagSweepHost />);
  const host = container.firstElementChild;
  const mix = host?.querySelector<HTMLElement>('[data-flag-mix]');
  if (!(host instanceof HTMLElement) || !mix) throw new Error('No se ha montado el barrido');

  const animate = vi.fn<HTMLElement['animate']>(
    () => ({ cancel: vi.fn() }) as unknown as Animation,
  );
  Object.defineProperty(mix, 'animate', { configurable: true, value: animate });
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 20));
  return { animate, host };
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
});
