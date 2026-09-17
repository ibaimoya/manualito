import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export function ManualThumbnail({
  color,
  stacked,
  processing = false,
  className,
  children,
}: Readonly<{
  color: string;
  stacked: boolean;
  processing?: boolean;
  className?: string;
  children?: ReactNode;
}>) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none relative h-[58px] w-[46px] shrink-0', className)}
    >
      {stacked && (
        <span className="manual-sheet-back absolute inset-0 rounded-md border border-border bg-surface-2" />
      )}
      <span className="manual-sheet-front relative block size-full overflow-hidden rounded-md border border-border bg-gradient-to-b from-bg to-surface shadow-sm">
        <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} />
        <span
          className="absolute right-0 top-0 size-3.5 bg-surface-2"
          style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }}
        />
        <span className="absolute inset-x-2 top-3.5 flex flex-col gap-1 pl-[3px]">
          {[88, 64, 78, 50, 70].map((width) => (
            <span
              key={width}
              className="h-[2.5px] rounded-full bg-fg/15"
              style={{ width: `${width}%` }}
            />
          ))}
        </span>
        {processing && <span className="proc-scan" />}
      </span>
      {children}
    </span>
  );
}
