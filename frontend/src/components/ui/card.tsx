import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-border bg-bg shadow-xs',
        'transition-shadow duration-150 ease-[var(--ease-mn)]',
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-[var(--m-space-1)] p-[var(--m-space-4)]', className)}
        {...props}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, children, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('font-display text-lg font-bold text-fg', className)}
        {...props}
      >
        {children}
      </h3>
    );
  },
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-fg-2', className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('p-[var(--m-space-4)] pt-0', className)}
        {...props}
      />
    );
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-[var(--m-space-2)] p-[var(--m-space-4)] pt-0',
          className,
        )}
        {...props}
      />
    );
  },
);
