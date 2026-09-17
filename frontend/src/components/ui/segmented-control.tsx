import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ReactNode, useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentOption<T>>;
  /** Etiqueta accesible del grupo. */
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: Readonly<SegmentedControlProps<T>>) {
  const indicatorId = useId();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-full border border-border bg-surface p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <RadioGroupPrimitive.Item
            key={o.value}
            value={o.value}
            className={cn(
              'icon-feedback relative isolate inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'text-fg' : 'text-fg-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={reducedMotion ? undefined : indicatorId}
                className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-card"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                aria-hidden="true"
              />
            )}
            {o.icon ? (
              <span
                aria-hidden="true"
                data-feedback-icon={o.value}
                className="grid place-items-center [&_svg]:size-4"
              >
                {o.icon}
              </span>
            ) : null}
            {o.label}
            {typeof o.count === 'number' ? (
              <span
                aria-hidden="true"
                className="min-w-[1ch] text-center font-normal text-fg-2 tabular-nums"
              >
                {o.count}
              </span>
            ) : null}
            <RadioGroupPrimitive.Indicator className="sr-only" />
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
