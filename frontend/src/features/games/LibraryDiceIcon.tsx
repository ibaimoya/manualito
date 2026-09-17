import { animate } from 'motion';
import { motion, useMotionValue } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import './library-dice.css';

const PIPS = [
  [92, 92],
  [164, 92],
  [128, 128],
  [92, 164],
  [164, 164],
] as const;
const FACES = [
  [0, 1, 2, 3, 4],
  [0, 2, 4],
  [0, 4],
  [0, 1, 3, 4],
] as const;

export function LibraryDiceIcon() {
  const dice = useRef<HTMLSpanElement>(null);
  const angle = useMotionValue(0);
  const canRoll = useMediaQuery('(prefers-reduced-motion: no-preference)');

  useEffect(() => {
    const button = dice.current?.closest('button');
    if (!canRoll || !button) {
      angle.jump(Math.round(angle.get() / 90) * 90);
      return;
    }
    const roll = () => {
      // Los clics durante un giro no acumulan vueltas.
      if (angle.isAnimating()) return;
      animate(angle, angle.get() - 90, { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] });
    };
    button.addEventListener('click', roll);
    return () => {
      button.removeEventListener('click', roll);
      angle.stop();
    };
  }, [angle, canRoll]);

  return (
    <motion.span ref={dice} className="library-die" aria-hidden="true" style={{ rotateX: angle }}>
      {FACES.map((pips, face) => (
        <svg
          key={face}
          width="16"
          height="16"
          viewBox="0 0 256 256"
          fill="currentColor"
          style={{ transform: `rotateX(${face * 90}deg) translateZ(5.5px)` }}
        >
          <rect
            x="40"
            y="40"
            width="176"
            height="176"
            rx="24"
            fill="var(--die-paper)"
            stroke="currentColor"
            strokeWidth="16"
          />
          {pips.map((pip) => (
            <circle key={pip} cx={PIPS[pip][0]} cy={PIPS[pip][1]} r="12" />
          ))}
        </svg>
      ))}
    </motion.span>
  );
}
