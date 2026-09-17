import { animate } from 'motion';
import { useCallback } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

export function spainStripes(wave: number) {
  return (
    `M0 0H24V4.5C16 ${4.5 - wave} 8 ${4.5 + wave} 0 4.5Z ` +
    `M0 13.5C8 ${13.5 + wave} 16 ${13.5 - wave} 24 13.5V18H0Z`
  );
}

export function useFlagWave<T extends HTMLElement>() {
  const canAnimate = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  return useCallback(
    (host: T | null) => {
      const stripes = host?.querySelector<SVGPathElement>('[data-flag-wave]');
      if (!host || !stripes || !canAnimate) return undefined;
      let wave = 0;
      let animation: ReturnType<typeof animate> | undefined;

      const move = (keyframes: number[], duration: number) => {
        animation?.stop();
        animation = animate(wave, [wave, ...keyframes], {
          duration,
          ease: [0.2, 0.8, 0.2, 1],
          onUpdate: (value) => {
            wave = value;
            stripes.setAttribute('d', spainStripes(value));
          },
        });
      };
      const onEnter = () => move([6, -6, 3, 0], 1.2);
      const onLeave = () => move([0], 0.3);

      host.addEventListener('mouseenter', onEnter);
      host.addEventListener('mouseleave', onLeave);
      return () => {
        host.removeEventListener('mouseenter', onEnter);
        host.removeEventListener('mouseleave', onLeave);
        animation?.stop();
        stripes.setAttribute('d', spainStripes(0));
      };
    },
    [canAnimate],
  );
}
