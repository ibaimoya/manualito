import { WarningCircleIcon, CheckIcon } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import { cn } from '@/shared/lib/cn';
import { FeedbackReveal } from './FeedbackReveal';

export function FieldFeedback({
  id,
  error,
  success,
}: Readonly<{ id: string; error?: string; success?: string }>) {
  const message = error || success;
  const Icon = error ? WarningCircleIcon : CheckIcon;

  return (
    <div id={id} aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {message && (
          <FeedbackReveal key="feedback">
            <p
              className={cn(
                'mt-1.5 flex items-start gap-1.5 px-1 text-[13px] leading-5',
                error ? 'text-error' : 'text-fg-2',
              )}
            >
              <Icon size={14} className="mt-[3px] shrink-0" aria-hidden="true" />
              {message}
            </p>
          </FeedbackReveal>
        )}
      </AnimatePresence>
    </div>
  );
}
