import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-body font-semibold tracking-tight',
  {
    variants: {
      tone: {
        neutral: 'bg-surface text-fg-2 border border-border',
        primary: 'bg-primary-100 text-primary-700',
        accent: 'bg-accent-100 text-accent',
        success: 'bg-success-bg text-success',
        error: 'bg-error-bg text-error',
        warning: 'bg-warning-bg text-warning',
      },
      size: {
        sm: 'h-6 px-2 text-xs',
        md: 'h-7 px-3 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { icon?: ReactNode };

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, tone, size, icon, children, ...props },
  ref,
) {
  return (
    <span ref={ref} className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {icon ? <span className="inline-grid place-items-center [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span> : null}
      {children}
    </span>
  );
});
