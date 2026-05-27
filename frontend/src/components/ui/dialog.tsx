import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Dialog centrado para desktop (`md+`).
 *
 * Diferencias respecto a `<Sheet>` (móvil):
 *  - Posición: centro de pantalla, no anclado abajo.
 *  - Animación: fade + zoom-in suave (no slide-up).
 *  - Ancho fijo (max-w-md por defecto), no full-width.
 *  - Sin "handle" decorativo (en desktop no aplica gesture táctil).
 */

export const Dialog = ({
  open,
  onOpenChange,
  children,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /**
   * Clases extra para el panel del Dialog.  Útil para anchuras más
   * grandes (ej. `max-w-2xl` para visores de texto) o controlar altura
   * en pantallas con mucho contenido.  Se aplica después del className
   * por defecto, así sobrescribe.
   */
  contentClassName?: string;
}) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-mn-dialog-overlay
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />
      <DialogPrimitive.Content
        data-mn-dialog
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-md',
          '-translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-border bg-bg shadow-lg',
          'focus:outline-none',
          contentClassName,
        )}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export const DialogHeader = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  {
    title: string;
    description?: string;
    onClose?: () => void;
  }
>(function DialogHeader({ title, description, onClose }, ref) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
      <div className="flex-1">
        <DialogPrimitive.Title
          ref={ref}
          className="font-display text-xl font-bold tracking-tight text-fg"
        >
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-fg-2">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      {onClose ? (
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </DialogPrimitive.Close>
      ) : null}
    </header>
  );
});

export const DialogBody = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cn('px-5 pb-5 pt-2', className)}>{children}</div>;
