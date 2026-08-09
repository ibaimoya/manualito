import { useCallback } from 'react';

const SWEEP_MS = 1500;
const RETURN_MS = 300;
const EDGE = 0.98;

/* Barrido en hover por WAAPI, una animación CSS de hover no es cancelable */
export function useFlagSweep<T extends HTMLElement>() {
  // Ref callback con cleanup, los items de un menú en portal montan tarde
  return useCallback((host: T | null) => {
    if (!host) return undefined;
    let anim: Animation | null = null;

    const findMix = () => host.querySelector<HTMLElement>('[data-flag-mix]');
    const currentS = (mix: HTMLElement) =>
      Number.parseFloat(getComputedStyle(mix).getPropertyValue('--flag-s')) || 0;

    const onEnter = (e: MouseEvent) => {
      const mix = findMix();
      // Sin WAAPI (jsdom, navegadores viejos) no hay barrido
      if (!mix || typeof mix.animate !== 'function') return;
      if (globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const s = currentS(mix);
      anim?.cancel();
      const { left, width } = host.getBoundingClientRect();
      // Desde el centro, el cursor empuja el barrido hacia el lado opuesto
      const pushDir = e.clientX < left + width / 2 ? 1 : -1;
      const dir = Math.abs(s) > 0.05 ? Math.sign(s) : pushDir;
      anim = mix.animate(
        [
          { '--flag-s': s },
          { '--flag-s': EDGE * dir, offset: 0.3 },
          { '--flag-s': EDGE * dir, offset: 0.42 },
          { '--flag-s': -EDGE * dir, offset: 0.72 },
          { '--flag-s': -EDGE * dir, offset: 0.84 },
          { '--flag-s': 0 },
        ],
        { duration: SWEEP_MS, easing: 'ease-in-out' },
      );
    };

    const onLeave = () => {
      const mix = findMix();
      if (!mix || typeof mix.animate !== 'function') return;
      const s = currentS(mix);
      anim?.cancel();
      anim = null;
      if (s === 0) return;
      anim = mix.animate([{ '--flag-s': s }, { '--flag-s': 0 }], {
        duration: RETURN_MS,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
      });
    };

    host.addEventListener('mouseenter', onEnter);
    host.addEventListener('mouseleave', onLeave);
    return () => {
      host.removeEventListener('mouseenter', onEnter);
      host.removeEventListener('mouseleave', onLeave);
      anim?.cancel();
    };
  }, []);
}
