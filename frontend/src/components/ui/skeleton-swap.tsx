import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useMotionValue } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';

export function SkeletonSwap({
  pending,
  skeleton,
  children,
  className,
}: Readonly<{
  pending: boolean;
  skeleton: ReactNode;
  children?: ReactNode;
  className?: string;
}>) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [height, setHeight] = useState<number>();
  const animatedHeight = useMotionValue<number | string>('auto');

  useLayoutEffect(() => {
    if (reducedMotion) animatedHeight.jump('auto');
  }, [animatedHeight, reducedMotion]);

  return (
    <motion.div
      aria-busy={pending}
      className={cn('relative grid min-h-0 min-w-0', className)}
      style={{ height: animatedHeight }}
      animate={{ height: pending ? height : 'auto' }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <AnimatePresence initial={pending}>
        <SwapLayer key={pending ? 'skeleton' : 'content'} pending={pending} onHeight={setHeight}>
          {pending ? skeleton : children}
        </SwapLayer>
      </AnimatePresence>
    </motion.div>
  );
}

function SwapLayer({
  pending,
  onHeight,
  children,
}: Readonly<{
  pending: boolean;
  onHeight: (height: number) => void;
  children: ReactNode;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  useLayoutEffect(() => {
    if (!reducedMotion) return;
    ref.current?.getAnimations().forEach((animation) => animation.finish());
  }, [isPresent, reducedMotion]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !isPresent || !pending) return;
    const measure = () => onHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isPresent, onHeight, pending]);

  return (
    <motion.div
      ref={ref}
      aria-hidden={pending || !isPresent || undefined}
      inert={pending || !isPresent}
      className={cn(
        'col-start-1 row-start-1 flex min-w-0 flex-col',
        !isPresent && 'absolute inset-x-0 top-0',
      )}
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.12 } }}
      transition={{
        duration: reducedMotion ? 0 : 0.2,
        delay: pending && !reducedMotion ? 0.12 : 0,
      }}
    >
      {children}
    </motion.div>
  );
}
