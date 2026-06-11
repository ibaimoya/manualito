import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/** Cabecera de sección v2: eyebrow en mono-mayúsculas + título + acción. */
export function SectionHead({
  eyebrow,
  title,
  right,
  className,
}: Readonly<{ eyebrow: string; title: string; right?: ReactNode; className?: string }>) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          {eyebrow}
        </span>
        <h2 className="truncate font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}
