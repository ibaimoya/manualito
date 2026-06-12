import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Menú contextual (kebab) sobre Radix DropdownMenu: foco gestionado,
 * flechas de teclado, Escape y cierre al hacer click fuera vienen de serie.
 */

// No-modal: con menú y Dialog modales, el cierre cruzado deja el body bloqueado.
export const DropdownMenu = (
  props: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>,
) => <DropdownMenuPrimitive.Root modal={false} {...props} />;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        data-mn-menu=""
        className={cn('z-50 min-w-44 rounded-2xl border border-border bg-bg p-1.5 shadow-md', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }
>(function DropdownMenuItem({ className, danger = false, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none',
        danger
          ? 'text-error data-[highlighted]:bg-error-bg'
          : 'text-fg data-[highlighted]:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
});
