import { useEffect, useRef, type MouseEvent } from 'react';
import { stagger, useAnimate } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

const WAVE_PARTS = '[data-text-wave]';
const REST = 'translateY(0px)';

export function useTextWave<T extends HTMLElement>() {
  const [scope, animate] = useAnimate<T>();
  const playback = useRef<ReturnType<typeof animate> | null>(null);
  const canAnimate = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  useEffect(() => {
    if (!canAnimate) {
      playback.current?.stop();
      void animate(WAVE_PARTS, { transform: REST }, { duration: 0 });
    }
    return () => playback.current?.stop();
  }, [animate, canAnimate]);

  function wave(event: MouseEvent<T>) {
    if (!canAnimate) return;
    playback.current?.stop();
    const distances = Array.from(event.currentTarget.querySelectorAll(WAVE_PARTS), (part) => {
      const { left, width } = part.getBoundingClientRect();
      return Math.abs(event.clientX - (left + width / 2));
    });
    const origin = distances.indexOf(Math.min(...distances));
    playback.current = animate(
      WAVE_PARTS,
      { transform: [null, 'translateY(-3px)', 'translateY(1.5px)', REST] },
      { duration: 0.28, delay: stagger(0.016, { from: origin }), ease: 'easeInOut' },
    );
  }

  function settle() {
    playback.current?.stop();
    playback.current = animate(
      WAVE_PARTS,
      { transform: REST },
      { duration: canAnimate ? 0.12 : 0, ease: 'easeOut' },
    );
  }

  return { ref: scope, onMouseEnter: wave, onMouseLeave: settle };
}
