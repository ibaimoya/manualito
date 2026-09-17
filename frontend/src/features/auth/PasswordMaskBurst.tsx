import { useLayoutEffect, useState, type RefObject } from 'react';
import { motion } from 'motion/react';

type MaskGeometry = {
  positions: number[];
  center: number;
  radius: number;
  left: number;
  right: number;
};

function measureMask(input: HTMLInputElement): MaskGeometry | null {
  if (!input.clientWidth) return null;
  const style = getComputedStyle(input);
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  context.font = `${style.fontSize} ${style.fontFamily}`;
  const metrics = context.measureText('•');
  const spacing = metrics.width;
  const baseline =
    input.offsetHeight / 2 + (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2;
  const left = Number.parseFloat(style.paddingLeft) + input.clientLeft;
  const right = Number.parseFloat(style.paddingRight) + input.clientLeft;
  const width = input.offsetWidth - left - right;
  const first = Math.floor(input.scrollLeft / spacing);
  const count = Math.min(input.value.length - first, Math.ceil(width / spacing) + 1);
  return {
    positions: Array.from(
      { length: Math.max(0, count) },
      (_, i) => (first + i + 0.5) * spacing - input.scrollLeft,
    ),
    center: baseline - (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2,
    radius: (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) / 2,
    left,
    right,
  };
}

export function PasswordMaskBurst({
  inputRef,
  reducedMotion,
  onComplete,
}: Readonly<{
  inputRef: RefObject<HTMLInputElement | null>;
  reducedMotion: boolean;
  onComplete: () => void;
}>) {
  const [geometry, setGeometry] = useState<MaskGeometry | null>(null);

  useLayoutEffect(() => {
    const mask = reducedMotion || !inputRef.current ? null : measureMask(inputRef.current);
    if (!mask?.positions.length) onComplete();
    else setGeometry(mask);
  }, [inputRef, onComplete, reducedMotion]);

  if (!geometry || reducedMotion) return null;
  const { positions, center, radius, left, right } = geometry;
  const stagger = Math.min(0.045, 0.45 / Math.max(1, positions.length - 1));

  return (
    <span
      aria-hidden="true"
      className="password-mask-burst pointer-events-none absolute inset-y-0 overflow-hidden text-fg"
      style={{ left, right }}
    >
      <svg
        className="size-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      >
        {positions.map((x, index) => (
          <g key={x} transform={`translate(${x} ${center})`}>
            <motion.circle
              r={radius}
              fill="currentColor"
              stroke="none"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1.8, 0.95, 1] }}
              transition={{
                duration: 0.28,
                delay: index * stagger,
                times: [0, 0.3, 0.7, 1],
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={index === positions.length - 1 ? onComplete : undefined}
            />
            <motion.path
              d="m-3-3-1-1m7 1 1-1m-1 7 1 1m-7-1-1 1"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: [0, 0.55, 0], scale: 1.6 }}
              transition={{
                duration: 0.22,
                delay: index * stagger,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </g>
        ))}
      </svg>
    </span>
  );
}
