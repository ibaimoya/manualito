import { useEffect, useRef, useState } from 'react';
import { animate as animateValue, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

export function useTypewriter(
  text: string,
  animate: boolean,
): Readonly<{ shown: string; done: boolean }> {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const willAnimate = animate && !reducedMotion;
  const progress = useMotionValue(willAnimate ? 0 : text.length);
  const previousText = useRef(text);
  const [display, setDisplay] = useState({ text, count: willAnimate ? 0 : text.length });

  useMotionValueEvent(progress, 'change', (count) => {
    setDisplay({ text, count: Math.ceil(count) });
  });

  useEffect(() => {
    if (previousText.current !== text) {
      previousText.current = text;
      progress.jump(0);
    }
    if (!willAnimate) {
      progress.jump(text.length);
      return;
    }
    if (progress.get() === text.length) return;
    const step = Math.ceil(text.length / Math.min(Math.max(text.length, 24), 70));
    const playback = animateValue(progress, text.length, {
      duration: Math.ceil((text.length - progress.get()) / step) * 0.022,
      ease: 'linear',
    });
    return () => playback.stop();
  }, [text, willAnimate, progress]);

  const count = display.text === text ? display.count : 0;
  return {
    shown: willAnimate ? text.slice(0, count) : text,
    done: !willAnimate || count >= text.length,
  };
}

export function useRetypingTitle(target: string): string {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const current = useMotionValue(target);
  const [shown, setShown] = useState(target);
  useMotionValueEvent(current, 'change', setShown);

  useEffect(() => {
    if (reducedMotion) {
      current.jump(target);
      return;
    }
    const from = current.get();
    if (from === target) return;
    const length = from.length + target.length;
    const playback = animateValue(0, length, {
      duration: Math.min(length * 0.032, 1.5),
      ease: 'linear',
      onUpdate: (progress) => {
        const step = Math.floor(progress);
        current.set(
          step < from.length
            ? from.slice(0, from.length - step)
            : target.slice(0, step - from.length),
        );
      },
    });
    return () => playback.stop();
  }, [target, reducedMotion, current]);

  return reducedMotion ? target : shown;
}
