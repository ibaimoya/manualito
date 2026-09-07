import { AnimatePresence, motion } from 'motion/react';
import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';
import './help-indicator.css';

export type HelpTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** Una ayuda propia usa botón. Dentro de otro control, el padre ofrece la ayuda. */
export function HelpIndicator({
  icon: Icon,
  label,
  tone = 'neutral',
  children,
  className,
  iconClassName,
  passive = false,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  tone?: HelpTone;
  children?: ReactNode;
  className?: string;
  iconClassName?: string;
  passive?: boolean;
}>) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const accessibleName =
    typeof children === 'string' || typeof children === 'number' ? `${children}. ${label}` : label;
  const glyph = <Icon size={18} strokeWidth={1.8} className={iconClassName} aria-hidden="true" />;
  const content = (
    <>
      <span className="help-indicator-glyph" aria-hidden="true">
        {reducedMotion ? (
          glyph
        ) : (
          <AnimatePresence initial={false}>
            <motion.span
              key={Icon.displayName}
              className="help-indicator-layer"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
            >
              {glyph}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
      {children}
    </>
  );

  if (passive) {
    return (
      <span
        className={cn('help-indicator help-indicator-passive', className)}
        data-tone={tone}
        aria-label={accessibleName}
      >
        {content}
      </span>
    );
  }

  return (
    <Tooltip content={label} touch>
      <button
        type="button"
        className={cn('help-indicator', className)}
        data-tone={tone}
        aria-label={accessibleName}
      >
        {content}
      </button>
    </Tooltip>
  );
}
