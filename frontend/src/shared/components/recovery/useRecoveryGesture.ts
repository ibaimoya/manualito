import { useEffect } from 'react';
import { hover, stagger } from 'motion';
import { useAnimate } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import type { RecoveryKind } from './RecoveryContent';

// Las piezas viven dentro de un svg con rejilla 256, así que estos px son
// unidades del viewBox y escalan con el tamaño de render.
const REST = 'translateY(0px) scale(1, 1)';
const ALERT_HOP = 'translateY(-11px) scale(1, 1)';
const WAVE_LIFT = 'translateY(-5px) scale(1.04, 1.04)';
const EASE = [0.2, 0.8, 0.2, 1] as const;

export function useRecoveryGesture(kind: RecoveryKind, retrying: boolean) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const canMove = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  useEffect(() => {
    const parts = scope.current?.querySelectorAll('[data-recovery-gesture]');
    if (!parts?.length) return;
    void animate(parts, { transform: REST, opacity: 1 }, { duration: 0 });
    if (!canMove || retrying) return;

    let playback: ReturnType<typeof animate> | undefined;
    const stopHover = hover(scope.current, () => {
      playback?.stop();
      if (kind === 'error') {
        playback = animate(
          parts,
          {
            transform: [null, ALERT_HOP, REST],
          },
          { duration: 0.38, times: [0, 0.3, 1], ease: [EASE, 'easeInOut'] },
        );
      } else {
        playback = animate(
          parts,
          {
            opacity: [null, 0.2, 1],
            transform: [null, WAVE_LIFT, REST],
          },
          { duration: 0.42, delay: stagger(0.09), ease: EASE },
        );
      }
      return () => {
        playback?.stop();
        playback = animate(parts, { transform: REST, opacity: 1 }, { duration: 0.16, ease: EASE });
      };
    });

    return () => {
      stopHover();
      playback?.stop();
    };
  }, [animate, canMove, kind, retrying, scope]);

  return scope;
}
