import { type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import { FeedbackReveal } from './FeedbackReveal';

/** Aviso de error de un formulario de auth (anuncia a lectores de pantalla). */
export function AuthAlert({
  title,
  children,
  className,
  open = true,
}: Readonly<{ title: string; children: ReactNode; className?: string; open?: boolean }>) {
  return (
    <AnimatePresence>
      {open && (
        <FeedbackReveal key="alert">
          <div role="alert" className={cn('flex items-start gap-2.5 text-sm', className)}>
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <div>
              <p className="font-semibold text-error">{title}</p>
              <p className="mt-1 text-fg-2">{children}</p>
            </div>
          </div>
        </FeedbackReveal>
      )}
    </AnimatePresence>
  );
}
