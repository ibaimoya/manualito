import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ComponentRef,
} from 'react';
import { cn } from '@/shared/lib/cn';

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = forwardRef<
  ComponentRef<typeof AccordionPrimitive.Item>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('overflow-hidden rounded-xl border border-border bg-surface', className)}
      {...props}
    />
  );
});

export const AccordionTrigger = forwardRef<
  ComponentRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
    /** Nivel del heading: Radix usa h3; pásalo cuando el anterior sea un h1. */
    headingLevel?: 2 | 3;
    /** En carga: spinner en vez de la flecha (combínalo con el item disabled). */
    loading?: boolean;
  }
>(function AccordionTrigger({ className, children, headingLevel = 3, loading = false, ...props }, ref) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <AccordionPrimitive.Header asChild>
      <Heading className="flex">
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn(
            'flex flex-1 items-center justify-between gap-[var(--m-space-3)] p-[var(--m-space-4)] text-left font-display text-base font-bold text-fg',
            'transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            loading ? 'cursor-default' : 'hover:bg-surface-2 [&[data-state=open]>svg]:rotate-180',
            className,
          )}
          {...props}
        >
          {children}
          {loading ? (
            <Loader2
              size={18}
              strokeWidth={2}
              className="shrink-0 animate-spin text-fg-3"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              size={20}
              strokeWidth={2}
              className="shrink-0 text-fg-3 transition-transform duration-200"
            />
          )}
        </AccordionPrimitive.Trigger>
      </Heading>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = forwardRef<
  ComponentRef<typeof AccordionPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden text-base text-fg-2',
        'data-[state=closed]:animate-[accordion-up_200ms_ease-out]',
        'data-[state=open]:animate-[accordion-down_200ms_ease-out]',
      )}
      {...props}
    >
      <div
        className={cn(
          'border-t border-border bg-card px-[var(--m-space-4)] py-[var(--m-space-4)]',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
});
