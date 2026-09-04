import { type ReactNode, useEffect } from 'react';
import { animate, motion, useMotionValue, usePresence, useTransform } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

export function FeedbackReveal({ children }: Readonly<{ children: ReactNode }>) {
  const [isPresent, safeToRemove] = usePresence();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const progress = useMotionValue(reducedMotion ? 1 : 0);
  const rows = useTransform(progress, (value) => `${value}fr`);

  useEffect(() => {
    if (reducedMotion) {
      progress.jump(isPresent ? 1 : 0);
      if (!isPresent) safeToRemove?.();
      return;
    }
    let active = true;
    const animation = animate(progress, isPresent ? 1 : 0, {
      duration: 0.24,
      ease: [0.2, 0.8, 0.2, 1],
    });
    void animation.then(() => {
      if (active && !isPresent) safeToRemove?.();
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [isPresent, progress, reducedMotion, safeToRemove]);

  return (
    <motion.div
      aria-hidden={!isPresent || undefined}
      inert={!isPresent}
      className="grid"
      style={{ gridTemplateRows: rows, opacity: progress }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </motion.div>
  );
}
