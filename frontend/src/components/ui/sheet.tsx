import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ElementRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Bottom sheet (modal anclado abajo) construido sobre Radix Dialog.
 *
 * - Bloquea scroll del fondo y oscurece con overlay.
 * - Foco atrapado dentro mientras está abierto (a11y).
 * - Animación slide-up + fade del overlay, respetando prefers-reduced-motion.
 * - Cierra con Escape, click en overlay, o botón X.
 *
 * Uso:
 *   <Sheet open={open} onOpenChange={setOpen}>
 *     <SheetHeader title="Ponle nombre al manual" />
 *     <SheetBody>…</SheetBody>
 *   </Sheet>
 */

export const Sheet = ({
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** @deprecated alias histórico de `contentClassName`. */
  className?: string;
  /**
   * Clases extra para el panel del Sheet — útil cuando el caso de uso
   * necesita una anchura mayor que el default o controlar altura/flex.
   * Se mergea DESPUÉS del className interno, así sobrescribe estilos
   * conflictivos (max-w, h, flex…).
   */
  contentClassName?: string;
}) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-mn-overlay
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      />
      <DialogPrimitive.Content
        data-mn-sheet
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-md',
          'rounded-t-3xl border-t border-border bg-bg shadow-lg',
          'focus:outline-none',
          className,
          contentClassName,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* "Handle" decorativo arriba para sugerir gesture */}
        <div className="flex justify-center pt-3" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export const SheetHeader = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  {
    title: string;
    description?: string;
    onClose?: () => void;
  }
>(function SheetHeader({ title, description, onClose }, ref) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
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

export const SheetBody = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => <div className={cn('px-5 pb-5 pt-2', className)}>{children}</div>;

export const SheetFooter = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <footer
    className={cn(
      'flex items-center justify-end gap-2 border-t border-border px-5 py-3',
      className,
    )}
  >
    {children}
  </footer>
);

export const SheetClose = DialogPrimitive.Close;
