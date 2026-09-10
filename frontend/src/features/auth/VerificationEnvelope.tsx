import { useEffect, useState } from 'react';
import {
  animate,
  cubicBezier,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'motion/react';
import { Check, Clock3, Link2Off, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Meeple, Wordmark } from '@/shared/components/Brand';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import styles from './verification-envelope.module.css';

export type VerificationState = 'verified' | 'invalid' | 'unavailable' | 'pending';

const statusIcons = { verified: Check, invalid: Link2Off, unavailable: Clock3, pending: Mail };
const foldEase = cubicBezier(0.77, 0, 0.175, 1);

export function VerificationEnvelope({ state }: Readonly<{ state: VerificationState }>) {
  const { t } = useTranslation('auth');
  const [open, setOpen] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const opening = useMotionValue(0);
  // La carta espera a que la solapa deje paso. El cierre recorre la misma geometría al revés.
  const flapAngle = useTransform(opening, [0, 0.58, 1], [10, 180, 180], { ease: foldEase });
  const letterLift = useTransform(opening, [0, 0.58, 1], [0, 0, 1], { ease: foldEase });
  const flapTransform = useMotionTemplate`rotateX(${flapAngle}deg)`;
  const letterTransform = useMotionTemplate`translate3d(0, calc(var(--letter-lift) * ${letterLift}), 2px)`;
  const StatusIcon = statusIcons[state];
  const action = t(`status.verify.envelope.${open ? 'close' : 'open'}`);

  useEffect(() => {
    const target = open ? 1 : 0;
    if (reducedMotion) {
      opening.jump(target);
      return;
    }
    const animation = animate(opening, target, {
      duration: 0.76 * Math.abs(target - opening.get()),
      ease: 'linear',
    });
    return () => animation.stop();
  }, [open, opening, reducedMotion]);

  return (
    <button
      type="button"
      className={styles.stage}
      aria-label={action}
      aria-expanded={open}
      data-state={state}
      onClick={() => setOpen((current) => !current)}
    >
      <span className={styles.scene} aria-hidden="true">
        <span className={styles.shadow} />
        <span className={styles.envelope}>
          <span className={styles.back} />
          <motion.span className={styles.letter} style={{ transform: letterTransform }}>
            <span className={styles.letterHeading}>
              <Wordmark size={14} color="currentColor" />
              <span className={styles.stamp}>
                <StatusIcon size={18} strokeWidth={1.6} />
              </span>
            </span>
            <span className={styles.letterTitle}>{t(`status.verify.envelope.${state}.title`)}</span>
            <span className={styles.letterBody}>{t(`status.verify.envelope.${state}.body`)}</span>
          </motion.span>
          <span className={styles.pocket} />
          <motion.span className={styles.flap} style={{ transform: flapTransform }}>
            <span className={styles.flapFront}>
              <span className={styles.seal}>
                {state === 'verified' ? (
                  <Meeple size={26} />
                ) : (
                  <StatusIcon size={20} strokeWidth={1.7} />
                )}
              </span>
            </span>
            <span className={styles.flapBack} />
          </motion.span>
        </span>
      </span>
    </button>
  );
}
