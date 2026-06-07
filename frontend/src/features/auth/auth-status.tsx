import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

type StatusTone = 'accent' | 'success' | 'warning' | 'error';

const TONE_CLASS: Record<StatusTone, string> = {
  accent: 'bg-accent-100 text-accent',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
};

/**
 * Pantalla de estado centrada (icono + título + texto + acciones). La comparten
 * los resultados de reset y verificar email.
 */
export function AuthStatus({
  tone = 'accent',
  icon: Icon,
  title,
  body,
  footnote,
  children,
}: Readonly<{
  tone?: StatusTone;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  footnote?: string;
  children?: ReactNode;
}>) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={cn('mb-4 grid size-[68px] place-items-center rounded-full', TONE_CLASS[tone])}
      >
        <Icon size={32} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-2">{body}</p>
      {children ? <div className="mt-6 flex w-full flex-col gap-2.5">{children}</div> : null}
      {footnote ? <p className="mono mt-4 text-xs text-fg-3">{footnote}</p> : null}
    </div>
  );
}
