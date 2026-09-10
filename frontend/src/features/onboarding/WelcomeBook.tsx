import { useEffect, type PointerEvent } from 'react';
import { motion, useMotionTemplate, useSpring } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Meeple } from '@/shared/components/Brand';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import styles from './welcome-book.module.css';

const SPRING = { stiffness: 150, damping: 26, mass: 0.8 };
const MAX_TILT = 5;

/** La detección permanece en el marco fijo. Solo se transforma el libro. */
export function WelcomeBook() {
  const { t } = useTranslation('onboarding');
  const canMove = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );
  const tiltX = useSpring(0, SPRING);
  const tiltY = useSpring(0, SPRING);
  const coverAngle = useSpring(0, SPRING);
  const coverTransform = useMotionTemplate`translateZ(var(--book-half)) rotateY(${coverAngle}deg)`;

  useEffect(() => {
    if (canMove) return;
    tiltX.jump(0);
    tiltY.jump(0);
    coverAngle.jump(0);
  }, [canMove, coverAngle, tiltX, tiltY]);

  function followPointer(event: PointerEvent<HTMLDivElement>) {
    if (!canMove || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    tiltX.set(-y * MAX_TILT);
    tiltY.set(x * MAX_TILT);
    coverAngle.set(-16);
  }

  function rest() {
    tiltX.set(0);
    tiltY.set(0);
    coverAngle.set(0);
  }

  return (
    <div
      className={styles.stage}
      aria-hidden="true"
      onPointerMove={followPointer}
      onPointerLeave={rest}
      onPointerCancel={rest}
    >
      <div className={styles.shadow} />
      <div className={styles.arrival}>
        <motion.div className={styles.tilt} style={{ rotateX: tiltX, rotateY: tiltY }}>
          <div className={styles.book}>
            <div className={styles.back} />
            <div className={styles.paper}>
              <div className={styles.paperContent}>
                <p className={styles.paperTitle}>{t('book.pageTitle')}</p>
                <p>{t('book.preparation')}</p>
                <p>{t('book.turns')}</p>
                <p>{t('book.reference')}</p>
              </div>
              <span className={styles.paperNumber}>1</span>
            </div>
            <div className={styles.foreEdge} />
            <div className={styles.topEdge} />
            <div className={styles.bottomEdge} />
            <div className={styles.spine}>
              <span>Manualito</span>
            </div>
            <motion.div className={styles.cover} style={{ transform: coverTransform }}>
              <div className={styles.coverFace}>
                <span className={styles.coverTitle}>{t('book.coverTitle')}</span>
                <Meeple size={144} className={styles.coverMark} />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
