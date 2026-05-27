import { type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-gradient-to-r from-surface via-surface-2 to-surface bg-[length:200%_100%]',
        'animate-[mn-shimmer_1.4s_infinite_linear]',
        className,
      )}
      {...props}
    />
  );
}
