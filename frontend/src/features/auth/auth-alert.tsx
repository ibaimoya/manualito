import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/** Aviso de error de un formulario de auth (anuncia a lectores de pantalla). */
export function AuthAlert({
  title,
  children,
  className,
}: Readonly<{ title: string; children: ReactNode; className?: string }>) {
  return (
    <div
      role="alert"
      className={cn('rounded-xl border border-error/30 bg-error-bg px-4 py-3', className)}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          size={16}
          strokeWidth={2.2}
          className="mt-0.5 shrink-0 text-error"
          aria-hidden="true"
        />
        <div className="text-sm">
          <p className="font-semibold text-error">{title}</p>
          <p className="mt-0.5 text-fg-2">{children}</p>
        </div>
      </div>
    </div>
  );
}
