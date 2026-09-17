import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import './illustration-badge.css';

export const ILLUSTRATION_TONE_CLASS = {
  primary: 'bg-primary-700 text-primary-50',
  accent: 'illustration-badge-accent text-fg-inv',
  green: 'bg-success text-fg-inv',
  ochre: 'bg-warning text-fg-inv',
} as const;

export type IllustrationTone = keyof typeof ILLUSTRATION_TONE_CLASS;

export function IllustrationBadge({
  tone,
  children,
  className,
}: Readonly<{ tone: IllustrationTone; children: ReactNode; className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'illustration-badge grid size-8 shrink-0 place-items-center rounded-full',
        ILLUSTRATION_TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
