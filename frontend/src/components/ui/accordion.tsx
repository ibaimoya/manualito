import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
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
      className={cn('overflow-hidden rounded-xl border border-border bg-bg', className)}
      {...props}
    />
  );
});

export const AccordionTrigger = forwardRef<
  ComponentRef<typeof AccordionPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'flex flex-1 items-center justify-between gap-[var(--m-space-3)] p-[var(--m-space-4)] text-left font-display text-base font-bold text-fg',
          'transition-colors hover:bg-surface',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          '[&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          size={20}
          strokeWidth={2}
          className="shrink-0 text-fg-3 transition-transform duration-200"
        />
      </AccordionPrimitive.Trigger>
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
      <div className={cn('px-[var(--m-space-4)] pb-[var(--m-space-4)] pt-0', className)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
});
